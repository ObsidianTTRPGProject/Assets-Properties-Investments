-- =============================================================================
-- Migration 11 — voting / decisions per property
-- Run once in the Supabase SQL Editor.
-- =============================================================================
-- A vote is a motion raised against a property. Each member casts one ballot
-- (yes / no / abstain). When closed, the result is recorded on the vote.
-- =============================================================================

create table if not exists votes (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  title        text not null,
  description  text,
  status       text default 'open',     -- open | closed
  result       text,                     -- Passed | Failed | Tied (set on close)
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now()
);

create table if not exists vote_ballots (
  id           uuid primary key default gen_random_uuid(),
  vote_id      uuid references votes(id) on delete cascade,
  member_id    uuid references profiles(id) on delete set null,
  member_name  text,
  choice       text not null,            -- yes | no | abstain
  comment      text,
  created_at   timestamptz default now(),
  unique (vote_id, member_id)
);

alter table votes enable row level security;
alter table vote_ballots enable row level security;
drop policy if exists votes_auth on votes;
create policy votes_auth on votes for all to authenticated using (true) with check (true);
drop policy if exists vote_ballots_auth on vote_ballots;
create policy vote_ballots_auth on vote_ballots for all to authenticated using (true) with check (true);
