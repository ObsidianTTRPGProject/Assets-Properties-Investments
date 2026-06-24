-- =============================================================================
-- Migration 09 — depreciation assets
-- Run once in the Supabase SQL Editor.
-- =============================================================================
-- Each depreciable asset on a property. The app calculates the yearly
-- deduction and accumulated depreciation per financial year, using either:
--   prime       = Prime Cost (straight-line): cost x rate% per year
--   diminishing = Diminishing Value: written-down value x rate% per year
-- Rate is the annual percentage (e.g. capital works = 2.5).
-- =============================================================================

create table if not exists depreciation_items (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid references properties(id) on delete cascade,
  description     text not null,
  asset_type      text,                       -- capital_works | plant
  cost            numeric(14,2) not null,
  method          text default 'prime',       -- prime | diminishing
  rate            numeric(6,3) not null,       -- annual percent
  effective_life  numeric(6,2),                -- optional reference (years)
  start_date      date not null,
  note            text,
  created_at      timestamptz default now()
);

alter table depreciation_items enable row level security;
drop policy if exists depreciation_items_auth on depreciation_items;
create policy depreciation_items_auth on depreciation_items for all to authenticated using (true) with check (true);
