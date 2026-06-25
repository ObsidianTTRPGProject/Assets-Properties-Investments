-- =============================================================================
-- MULTI-TENANCY MIGRATION  —  run once in the Supabase SQL Editor.
-- =============================================================================
-- Converts the app from a single shared team into multiple companies whose data
-- is fully isolated from each other. IDEMPOTENT and safe to re-run.
--
-- What it does:
--   • adds a `companies` table and gives every user a company_id + role
--   • adds company_id to every data table, auto-stamped on insert
--   • REPLACES the old "any logged-in user sees everything" security with strict
--     per-company isolation (a user only sees rows for their own company)
--   • puts all existing data into one default company and makes you super admin
--
-- Roles: 'super_admin' (you — manage all companies/users)
--        'company_admin' (manage their own company's users)
--        'member' (normal user)
-- =============================================================================

-- ---------- 1. COMPANIES ------------------------------------------------------
create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz default now()
);
alter table companies enable row level security;

-- ---------- 2. PROFILES: company + role --------------------------------------
alter table profiles
  add column if not exists company_id uuid references companies(id) on delete set null,
  add column if not exists role       text not null default 'member';

-- ---------- 3. HELPER FUNCTIONS (security definer => bypass RLS, no recursion) -
create or replace function public.auth_company_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_company_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('company_admin','super_admin') from public.profiles where id = auth.uid()), false);
$$;

-- stamp company_id from the caller's profile on insert (so the app's existing
-- INSERTs don't need to change)
create or replace function public.stamp_company_id() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is null then
    new.company_id := public.auth_company_id();
  end if;
  return new;
end; $$;

-- prevent a normal user from escalating their own role / switching company by
-- editing their profile row directly (admin changes go via the service role,
-- where auth.uid() is null and is therefore allowed)
create or replace function public.protect_profile_privileges() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    new.role       := old.role;
    new.company_id := old.company_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_protect_profile on profiles;
create trigger trg_protect_profile before update on profiles
  for each row execute function public.protect_profile_privileges();

-- ---------- 4. DEFAULT COMPANY + BACKFILL ------------------------------------
insert into companies (name)
select 'My Company' where not exists (select 1 from companies);

update profiles
  set company_id = (select id from companies order by created_at limit 1)
  where company_id is null;

-- Make the owner the super admin. ► Change this email if your login differs ◄
update profiles set role = 'super_admin' where email = 'plunketj84@gmail.com';

-- ---------- 5. PROFILES policies (company-scoped) ----------------------------
alter table profiles enable row level security;
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "update own profile" on profiles;
drop policy if exists "insert own profile" on profiles;
drop policy if exists profiles_company_read on profiles;
drop policy if exists profiles_update_own on profiles;
drop policy if exists profiles_insert_own on profiles;
create policy profiles_company_read on profiles for select to authenticated
  using (id = auth.uid() or company_id = public.auth_company_id());
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on profiles for insert to authenticated
  with check (id = auth.uid());

-- ---------- 6. COMPANIES policies --------------------------------------------
drop policy if exists companies_read on companies;
create policy companies_read on companies for select to authenticated
  using (id = public.auth_company_id() or public.is_super_admin());
-- create/rename/delete companies happens through the admin Edge Function
-- (service role), so no write policy is granted to normal users.

-- ---------- 7. EVERY DATA TABLE: company_id + backfill + trigger + strict RLS -
do $$
declare
  t text;
  pol record;
  default_company uuid := (select id from companies order by created_at limit 1);
  tables text[] := array[
    'properties','contacts','tasks','bills','tenancies','tenants',
    'rent_payments','catchup_agreements','requests','photos','tenant_logs',
    'cashflow','depreciation_items','pool_contributions','pool_expenses',
    'pool_schedules','votes','vote_ballots'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then
      continue;  -- table doesn't exist in this project; skip
    end if;

    execute format('alter table public.%I add column if not exists company_id uuid references companies(id) on delete cascade', t);
    execute format('update public.%I set company_id = %L where company_id is null', t, default_company);
    execute format('alter table public.%I enable row level security', t);

    -- remove ALL existing policies (this clears the old permissive using(true)
    -- policies that would otherwise leak data across companies)
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    -- strict: a row is visible/insertable only for the caller's own company
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated '
      'using (company_id = public.auth_company_id()) '
      'with check (company_id = public.auth_company_id())', t);

    -- auto-stamp company_id on insert
    execute format('drop trigger if exists trg_stamp_company_id on public.%I', t);
    execute format('create trigger trg_stamp_company_id before insert on public.%I for each row execute function public.stamp_company_id()', t);
  end loop;
end $$;

-- =============================================================================
-- Done. After running:
--   1. Deploy the `admin` Edge Function and set its secrets.
--   2. Reload the app — you'll see an Admin menu. Create the second company and
--      its users there.
--   3. TEST isolation: log in as a company-2 user and confirm they see none of
--      company-1's properties/bills/etc.
-- Re-running this script is safe.
-- =============================================================================
