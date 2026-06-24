import { supabase } from './supabaseClient'

// Fire-and-forget call to the `notify` Edge Function. Never blocks the UI and
// never throws — if email isn't set up yet, the action still succeeds and we
// just skip the email.
export function notifyEmail(payload) {
  try {
    supabase.functions.invoke('notify', { body: payload }).catch(() => {})
  } catch {
    /* email is best-effort */
  }
}
