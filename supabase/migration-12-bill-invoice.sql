-- =============================================================================
-- Migration 12 — bill invoice number
-- Run once in the Supabase SQL Editor.
-- (The customer/account reference lives in bills.reference from migration 10.)
-- =============================================================================

alter table bills
  add column if not exists invoice_number text;
