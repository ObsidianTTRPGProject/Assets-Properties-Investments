-- =============================================================================
-- Daily "bills due soon" email — scheduled job
-- =============================================================================
-- Runs the notify Edge Function once a day with {"kind":"bills_scan"}.
-- The function emails everyone a digest of unpaid bills due within 7 days
-- (or already overdue). If nothing is due, no email is sent.
--
-- BEFORE RUNNING: replace YOUR_SERVICE_ROLE_KEY below with your project's
-- service role key. Find it in: Project Settings -> API -> Project API keys ->
-- "service_role" (click Reveal, then copy). Keep this key private.
--
-- Schedule: 22:00 UTC daily = ~7:30am Adelaide (winter) / 8:30am (summer DST).
-- Adjust the '0 22 * * *' cron expression if you'd prefer another time.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous version of this job so re-running is safe
select cron.unschedule('daily-bills-scan')
where exists (select 1 from cron.job where jobname = 'daily-bills-scan');

select cron.schedule(
  'daily-bills-scan',
  '0 22 * * *',
  $$
  select net.http_post(
    url     := 'https://wwlrjzirvnlwcufktlvr.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
               ),
    body    := jsonb_build_object('kind', 'bills_scan')
  );
  $$
);

-- =============================================================================
-- OPTIONAL TEST (run this single statement on its own to fire it right now):
--
--   select net.http_post(
--     url     := 'https://wwlrjzirvnlwcufktlvr.supabase.co/functions/v1/notify',
--     headers := jsonb_build_object(
--                  'Content-Type',  'application/json',
--                  'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--                ),
--     body    := jsonb_build_object('kind', 'bills_scan')
--   );
--
-- If you have a bill due within 7 days, everyone gets the digest email.
-- To see the scheduled job afterwards:  select * from cron.job;
-- =============================================================================
