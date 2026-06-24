-- =============================================================================
-- Migration 08 — recurring (scheduled) pool contributions
-- Run once in the Supabase SQL Editor.
-- =============================================================================
-- A schedule means "this member pays this amount, this often, from this date"
-- (until an optional end date). The app accrues these automatically so you
-- don't re-enter them weekly, and forecasts count them going forward.
-- To change the amount from a date, add a new schedule (and set an end date on
-- the old one, or leave both — the app sums whatever is active each period).
-- =============================================================================

create table if not exists pool_schedules (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid references profiles(id) on delete set null,
  member_name  text,
  amount       numeric(12,2) not null,
  frequency    text default 'weekly',   -- weekly, fortnightly, monthly
  start_date   date not null,
  end_date     date,                     -- null = ongoing
  note         text,
  created_at   timestamptz default now()
);

alter table pool_schedules enable row level security;
drop policy if exists pool_schedules_auth on pool_schedules;
create policy pool_schedules_auth on pool_schedules for all to authenticated using (true) with check (true);
