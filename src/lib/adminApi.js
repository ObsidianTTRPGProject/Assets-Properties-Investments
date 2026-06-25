import { supabase } from './supabaseClient'

// Calls the `admin` Edge Function. Throws on error so callers can try/catch.
export async function adminCall(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } })
  if (error) {
    // Surface the function's JSON error message when present.
    let msg = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) msg = ctx.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
