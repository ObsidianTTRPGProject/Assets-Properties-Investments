// Supabase Edge Function: notify
// Sends member emails via SendGrid for app events.
// Create this in your Supabase dashboard (Edge Functions → Create function →
// name it "notify" → paste this code → Deploy), then set the secrets:
//   SENDGRID_API_KEY  = your SendGrid API key
//   FROM_EMAIL        = the address you verified as a Single Sender
//   APP_URL           = https://obsidianttrpgproject.github.io/Assets-Properties-Investments/
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const SENDGRID = Deno.env.get('SENDGRID_API_KEY')
    const FROM = Deno.env.get('FROM_EMAIL')
    const APP_URL = Deno.env.get('APP_URL') ?? ''
    if (!SENDGRID || !FROM) return json({ error: 'Missing SENDGRID_API_KEY or FROM_EMAIL secret' }, 500)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    const kind: string = body.kind

    const allEmails = async (): Promise<string[]> => {
      const { data } = await admin.from('profiles').select('email').not('email', 'is', null)
      return (data ?? []).map((r: { email: string }) => r.email).filter(Boolean)
    }
    const propName = async (id?: string): Promise<string> => {
      if (!id) return ''
      const { data } = await admin.from('properties').select('nickname').eq('id', id).single()
      return data?.nickname ?? ''
    }
    const openLink = APP_URL ? `<p><a href="${APP_URL}">Open the app</a></p>` : ''

    let recipients: string[] = []
    let subject = ''
    let html = ''

    if (kind === 'vote_raised') {
      const p = await propName(body.propertyId)
      recipients = await allEmails()
      subject = `New vote: ${body.title}`
      html = `<p>A new vote has been raised${p ? ` for <b>${p}</b>` : ''} and needs your vote.</p>
        <p style="font-size:16px"><b>${body.title}</b></p>${body.description ? `<p>${body.description}</p>` : ''}
        <p>Please open the app and cast your vote (Yes / No / Abstain).</p>${openLink}`
    } else if (kind === 'vote_result') {
      const p = await propName(body.propertyId)
      recipients = await allEmails()
      subject = `Vote result: ${body.title} — ${body.result}`
      html = `<p>The vote${p ? ` for <b>${p}</b>` : ''} has closed.</p>
        <p style="font-size:16px"><b>${body.title}</b></p><p>Result: <b>${body.result}</b></p>${openLink}`
    } else if (kind === 'task_assigned') {
      const p = await propName(body.propertyId)
      if (body.toEmail) recipients = [body.toEmail]
      subject = `Task assigned to you: ${body.title}`
      html = `<p>A task has been assigned to you${p ? ` for <b>${p}</b>` : ''}.</p>
        <p style="font-size:16px"><b>${body.title}</b></p>${openLink}`
    } else if (kind === 'bills_scan') {
      const today = new Date().toISOString().slice(0, 10)
      const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
      const { data: bills } = await admin
        .from('bills').select('description, amount, due_date, status, property_id')
        .neq('status', 'paid').not('due_date', 'is', null).lte('due_date', soon)
      if (!bills || bills.length === 0) return json({ sent: 0, note: 'no bills due' })
      recipients = await allEmails()
      const rows = bills
        .map((b: any) => `<li>${b.description} — $${Number(b.amount).toFixed(2)} — due ${b.due_date}${b.due_date < today ? ' <b style="color:#b00">(OVERDUE)</b>' : ''}</li>`)
        .join('')
      subject = `Bills due soon (${bills.length})`
      html = `<p>These unpaid bills are due within 7 days or overdue:</p><ul>${rows}</ul>${openLink}`
    } else {
      return json({ error: 'unknown kind: ' + kind }, 400)
    }

    recipients = [...new Set(recipients)]
    if (recipients.length === 0) return json({ sent: 0, note: 'no recipients' })

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SENDGRID}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: recipients.map((email) => ({ to: [{ email }] })),
        from: { email: FROM, name: 'API — Assets, Properties & Investments' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    if (!res.ok) return json({ error: await res.text() }, 500)
    return json({ sent: recipients.length })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
