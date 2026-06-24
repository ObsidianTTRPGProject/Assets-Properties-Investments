-- =============================================================================
-- Migration 10 — bill reference number
-- Run once in the Supabase SQL Editor.
-- =============================================================================

alter table bills
  add column if not exists reference text;
