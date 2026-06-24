-- =============================================================================
-- Investment Property Manager — Database schema
-- Run this in the Supabase SQL Editor (one time) to create all tables,
-- security policies, and storage buckets.
-- =============================================================================
-- Currency convention: AUD. Rent default frequency: weekly.
-- Access model (v1): ANY authenticated team member has full read/write access.
-- (To add admin/viewer roles later, tighten the policies below.)
-- =============================================================================

-- ---------- PROPERTIES --------------------------------------------------------
create table if not exists properties (
  id              uuid primary key default gen_random_uuid(),
  nickname        text not null,
  address         text,                          -- legacy / display fallback
  -- structured address (populated via OpenStreetMap address lookup)
  street             text,
  suburb             text,
  state              text,
  postcode           text,
  country            text,
  latitude           double precision,
  longitude          double precision,
  formatted_address  text,
  osm_place_id       text,
  cover_photo_path   text,                       -- tile cover image (property-photos bucket)
  property_type   text,                         -- house, unit, townhouse, land...
  status          text default 'acquisition',   -- acquisition, construction, available, tenanted, sold
  purchase_date   date,
  purchase_price  numeric(14,2),
  current_value   numeric(14,2),
  land_size       text,
  bedrooms        int,
  bathrooms       int,
  car_spaces      int,
  build_stage     text,                          -- e.g. "Frame", "Lock-up", "Fit-out"
  build_progress  int,                           -- 0-100
  -- light mortgage/loan fields (optional)
  loan_lender     text,
  loan_balance    numeric(14,2),
  loan_rate       numeric(6,3),
  loan_repayment  numeric(14,2),
  notes           text,
  created_at      timestamptz default now()
);

-- ---------- CONTACTS (builders / companies) -----------------------------------
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  role        text,                              -- builder, plumber, electrician, agent...
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz default now()
);

-- ---------- PHOTOS -----------------------------------------------------------
create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  task_id      uuid,                             -- optional link to a task/incident
  storage_path text not null,                    -- path within the 'property-photos' bucket
  caption      text,
  category     text default 'progress',          -- progress, issue, general
  taken_on     date,
  created_at   timestamptz default now()
);

-- ---------- TASKS / INCIDENTS -------------------------------------------------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  title        text not null,
  description  text,
  task_type    text default 'maintenance',       -- build issue, maintenance, inspection, other
  status       text default 'open',              -- open, in progress, blocked, resolved, closed
  priority     text default 'medium',            -- low, medium, high
  contact_id   uuid references contacts(id) on delete set null,
  assigned_user_id uuid,                          -- references profiles(id), set in app
  due_date     date,
  resolved_on  date,
  created_at   timestamptz default now()
);

-- ---------- BILLS / EXPENSES --------------------------------------------------
create table if not exists bills (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid references properties(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete set null,
  description   text not null,
  category      text,                             -- rates, insurance, utilities, build, repairs, mgmt, interest...
  amount        numeric(14,2) not null,
  issue_date    date,
  due_date      date,
  status        text default 'unpaid',            -- unpaid, paid, overdue, disputed
  paid_date     date,
  document_path text,                             -- path within 'property-docs' bucket
  created_at    timestamptz default now()
);

-- ---------- TENANCIES & TENANTS ----------------------------------------------
create table if not exists tenancies (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid references properties(id) on delete cascade,
  move_in        date,
  move_out       date,                            -- null = current tenancy
  rent_amount    numeric(12,2),
  rent_frequency text default 'weekly',           -- weekly, fortnightly, monthly
  bond_amount    numeric(12,2),
  lease_start    date,
  lease_end      date,
  notes          text,
  created_at     timestamptz default now()
);

create table if not exists tenants (
  id                uuid primary key default gen_random_uuid(),
  tenancy_id        uuid references tenancies(id) on delete cascade,
  name              text not null,
  phone             text,
  email             text,
  emergency_contact text,
  is_primary        boolean default false,
  created_at        timestamptz default now()
);

-- ---------- RENT PAYMENTS -----------------------------------------------------
create table if not exists rent_payments (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid references tenancies(id) on delete cascade,
  due_date     date not null,
  amount_due   numeric(12,2) not null,
  amount_paid  numeric(12,2) default 0,
  paid_date    date,
  status       text default 'due',                -- paid, late, missed, due
  created_at   timestamptz default now()
);

-- ---------- CATCH-UP AGREEMENTS (arrears repayment plans) ---------------------
create table if not exists catchup_agreements (
  id          uuid primary key default gen_random_uuid(),
  tenancy_id  uuid references tenancies(id) on delete cascade,
  terms       text,
  total_owed  numeric(12,2),
  schedule    text,                               -- e.g. "$50/week extra until cleared"
  status      text default 'active',              -- active, completed, defaulted
  created_at  timestamptz default now()
);

-- ---------- TENANT REQUESTS ---------------------------------------------------
create table if not exists requests (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  tenant_id    uuid references tenants(id) on delete set null,
  title        text not null,
  description  text,
  status       text default 'new',                -- new, acknowledged, in progress, resolved, closed
  priority     text default 'medium',
  raised_on    date default current_date,
  task_id      uuid references tasks(id) on delete set null,  -- optional promotion to a work task
  created_at   timestamptz default now()
);

-- ---------- NOTIFICATION READ-STATE -------------------------------------------
create table if not exists notification_reads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade,
  notification_key  text not null,
  read_at           timestamptz default now(),
  unique (user_id, notification_key)
);
alter table notification_reads enable row level security;
create policy "manage own notification reads" on notification_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- TENANT LOGS (feedback / concerns) ---------------------------------
create table if not exists tenant_logs (
  id          uuid primary key default gen_random_uuid(),
  tenancy_id  uuid references tenancies(id) on delete cascade,
  note        text not null,
  created_at  timestamptz default now()
);

-- ---------- SHARED POOL (contributions + spending) ----------------------------
create table if not exists pool_contributions (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid references profiles(id) on delete set null,
  member_name     text,
  amount          numeric(12,2) not null,
  contributed_on  date default current_date,
  note            text,
  created_at      timestamptz default now()
);
create table if not exists pool_expenses (
  id           uuid primary key default gen_random_uuid(),
  description  text not null,
  amount       numeric(12,2) not null,
  spent_on     date default current_date,
  property_id  uuid references properties(id) on delete set null,
  note         text,
  created_at   timestamptz default now()
);
create table if not exists pool_schedules (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid references profiles(id) on delete set null,
  member_name  text,
  amount       numeric(12,2) not null,
  frequency    text default 'weekly',
  start_date   date not null,
  end_date     date,
  note         text,
  created_at   timestamptz default now()
);
create table if not exists depreciation_items (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid references properties(id) on delete cascade,
  description     text not null,
  asset_type      text,
  cost            numeric(14,2) not null,
  method          text default 'prime',
  rate            numeric(6,3) not null,
  effective_life  numeric(6,2),
  start_date      date not null,
  note            text,
  created_at      timestamptz default now()
);
alter table pool_contributions enable row level security;
alter table pool_expenses enable row level security;
alter table pool_schedules enable row level security;
alter table depreciation_items enable row level security;
create policy pool_contributions_auth on pool_contributions for all to authenticated using (true) with check (true);
create policy pool_expenses_auth on pool_expenses for all to authenticated using (true) with check (true);
create policy pool_schedules_auth on pool_schedules for all to authenticated using (true) with check (true);
create policy depreciation_items_auth on depreciation_items for all to authenticated using (true) with check (true);

-- ---------- CASH FLOW ---------------------------------------------------------
-- Manual one-off entries (purchase, sale, misc income). Bills and rent payments
-- are also aggregated for reporting, so this table is for everything else.
create table if not exists cashflow (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  entry_date   date not null,
  direction    text not null,                     -- income, expense
  amount       numeric(14,2) not null,
  category     text,
  description  text,
  created_at   timestamptz default now()
);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- Enable RLS on every table and allow access only to authenticated users.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'properties','contacts','photos','tasks','bills','tenancies',
    'tenants','rent_payments','catchup_agreements','requests','cashflow','tenant_logs'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_auth_all', t
    );
  end loop;
end $$;

-- =============================================================================
-- STORAGE BUCKETS (private). Create them, then allow authenticated access.
-- =============================================================================
insert into storage.buckets (id, name, public)
  values ('property-photos', 'property-photos', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('property-docs', 'property-docs', false)
  on conflict (id) do nothing;

create policy "authenticated read photos"  on storage.objects for select to authenticated using (bucket_id = 'property-photos');
create policy "authenticated write photos" on storage.objects for insert to authenticated with check (bucket_id = 'property-photos');
create policy "authenticated del photos"   on storage.objects for delete to authenticated using (bucket_id = 'property-photos');
create policy "authenticated read docs"    on storage.objects for select to authenticated using (bucket_id = 'property-docs');
create policy "authenticated write docs"   on storage.objects for insert to authenticated with check (bucket_id = 'property-docs');
create policy "authenticated del docs"     on storage.objects for delete to authenticated using (bucket_id = 'property-docs');

-- =============================================================================
-- TEAM MEMBER PROFILES (so tasks can be assigned to site users)
-- =============================================================================
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  created_at  timestamptz default now()
);
alter table profiles enable row level security;
create policy "authenticated read profiles" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "insert own profile" on profiles for insert to authenticated with check (auth.uid() = id);

insert into profiles (id, email)
  select id, email from auth.users on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
