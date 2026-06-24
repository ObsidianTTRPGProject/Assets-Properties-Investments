-- =============================================================================
-- API — one-shot database catch-up / update script
-- =============================================================================
-- Paste this whole file into the Supabase SQL Editor and Run it.
-- It is IDEMPOTENT: it only adds what's missing and is safe to run again any
-- time (e.g. after a future app update). It will not delete or overwrite data.
-- This single script replaces having to run the individual migration-XX files.
-- =============================================================================

-- ---------- PROPERTIES: structured address + cover photo ----------------------
alter table properties
  add column if not exists street             text,
  add column if not exists suburb             text,
  add column if not exists state              text,
  add column if not exists postcode           text,
  add column if not exists country            text,
  add column if not exists latitude           double precision,
  add column if not exists longitude          double precision,
  add column if not exists formatted_address  text,
  add column if not exists osm_place_id       text,
  add column if not exists cover_photo_path   text;
create index if not exists idx_properties_state    on properties (state);
create index if not exists idx_properties_postcode on properties (postcode);

-- ---------- TEAM MEMBER PROFILES ---------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  created_at  timestamptz default now()
);
alter table profiles add column if not exists phone text;
alter table profiles enable row level security;
drop policy if exists "authenticated read profiles" on profiles;
create policy "authenticated read profiles" on profiles for select to authenticated using (true);
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert to authenticated with check (auth.uid() = id);

insert into profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- TASKS: assign to a team member -----------------------------------
alter table tasks add column if not exists assigned_user_id uuid;

-- ---------- BILLS: reference + invoice number --------------------------------
alter table bills
  add column if not exists reference      text,
  add column if not exists invoice_number text;

-- ---------- TENANT LOGS -------------------------------------------------------
create table if not exists tenant_logs (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid references tenancies(id) on delete cascade,
  note text not null,
  created_at timestamptz default now()
);
alter table tenant_logs enable row level security;
drop policy if exists tenant_logs_auth on tenant_logs;
create policy tenant_logs_auth on tenant_logs for all to authenticated using (true) with check (true);

-- ---------- NOTIFICATION READ-STATE ------------------------------------------
create table if not exists notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz default now(),
  unique (user_id, notification_key)
);
alter table notification_reads enable row level security;
drop policy if exists "manage own notification reads" on notification_reads;
create policy "manage own notification reads" on notification_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- SHARED POOL (contributions, spending, recurring) ------------------
create table if not exists pool_contributions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references profiles(id) on delete set null,
  member_name text, amount numeric(12,2) not null,
  contributed_on date default current_date, note text, created_at timestamptz default now()
);
create table if not exists pool_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null, amount numeric(12,2) not null,
  spent_on date default current_date, property_id uuid references properties(id) on delete set null,
  note text, created_at timestamptz default now()
);
create table if not exists pool_schedules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references profiles(id) on delete set null,
  member_name text, amount numeric(12,2) not null, frequency text default 'weekly',
  start_date date not null, end_date date, note text, created_at timestamptz default now()
);
alter table pool_contributions enable row level security;
alter table pool_expenses enable row level security;
alter table pool_schedules enable row level security;
drop policy if exists pool_contributions_auth on pool_contributions;
create policy pool_contributions_auth on pool_contributions for all to authenticated using (true) with check (true);
drop policy if exists pool_expenses_auth on pool_expenses;
create policy pool_expenses_auth on pool_expenses for all to authenticated using (true) with check (true);
drop policy if exists pool_schedules_auth on pool_schedules;
create policy pool_schedules_auth on pool_schedules for all to authenticated using (true) with check (true);

-- ---------- DEPRECIATION ------------------------------------------------------
create table if not exists depreciation_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  description text not null, asset_type text, cost numeric(14,2) not null,
  method text default 'prime', rate numeric(6,3) not null, effective_life numeric(6,2),
  start_date date not null, note text, created_at timestamptz default now()
);
alter table depreciation_items enable row level security;
drop policy if exists depreciation_items_auth on depreciation_items;
create policy depreciation_items_auth on depreciation_items for all to authenticated using (true) with check (true);

-- ---------- VOTING ------------------------------------------------------------
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  title text not null, description text, status text default 'open', result text,
  created_by uuid references profiles(id) on delete set null, created_at timestamptz default now()
);
create table if not exists vote_ballots (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid references votes(id) on delete cascade,
  member_id uuid references profiles(id) on delete set null,
  member_name text, choice text not null, comment text, created_at timestamptz default now(),
  unique (vote_id, member_id)
);
alter table votes enable row level security;
alter table vote_ballots enable row level security;
drop policy if exists votes_auth on votes;
create policy votes_auth on votes for all to authenticated using (true) with check (true);
drop policy if exists vote_ballots_auth on vote_ballots;
create policy vote_ballots_auth on vote_ballots for all to authenticated using (true) with check (true);

-- =============================================================================
-- Done. Re-run this any time the app is updated to add new tables/columns.
-- =============================================================================
