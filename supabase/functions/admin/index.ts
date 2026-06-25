// Supabase Edge Function: admin
// Privileged user/company management, gated by the CALLER's role.
// Create it in the Supabase dashboard (Edge Functions → Create function → name
// it "admin" → paste this code → Deploy). No extra secrets are needed:
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically.
//
// The browser calls this with the signed-in user's token; we verify that user
// is a super_admin or company_admin before doing anything, and a company_admin
// can only ever act inside their own company.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } })

const URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    // Who is calling?
    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: u } = await asUser.auth.getUser()
    const caller = u?.user
    if (!caller) return json({ error: 'Not signed in' }, 401)

    const admin = createClient(URL, SERVICE)
    const { data: me } = await admin.from('profiles').select('role, company_id').eq('id', caller.id).single()
    if (!me || !['super_admin', 'company_admin'].includes(me.role)) {
      return json({ error: 'Not authorised' }, 403)
    }
    const isSuper = me.role === 'super_admin'

    const body = await req.json()
    const action: string = body.action

    // ---- helpers ----------------------------------------------------------
    const targetCompany = async (userId: string): Promise<string | null> => {
      const { data } = await admin.from('profiles').select('company_id').eq('id', userId).single()
      return data?.company_id ?? null
    }
    // company_admins are confined to their own company and may not grant super_admin
    const guardCompany = (companyId: string | null | undefined) => {
      if (isSuper) return true
      return companyId && companyId === me.company_id
    }
    const guardRole = (role: string) => {
      if (isSuper) return ['super_admin', 'company_admin', 'member'].includes(role)
      return ['company_admin', 'member'].includes(role)
    }

    switch (action) {
      // ----- companies (super admin only) ---------------------------------
      case 'list_companies': {
        if (!isSuper) return json({ error: 'Super admin only' }, 403)
        const { data, error } = await admin.from('companies').select('id, name, created_at').order('name')
        if (error) return json({ error: error.message }, 500)
        return json({ companies: data })
      }
      case 'create_company': {
        if (!isSuper) return json({ error: 'Super admin only' }, 403)
        const name = (body.name ?? '').trim()
        if (!name) return json({ error: 'Company name required' }, 400)
        const { data, error } = await admin.from('companies').insert({ name }).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ company: data })
      }
      case 'rename_company': {
        if (!isSuper) return json({ error: 'Super admin only' }, 403)
        const { error } = await admin.from('companies').update({ name: (body.name ?? '').trim() }).eq('id', body.company_id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // ----- users ---------------------------------------------------------
      case 'list_users': {
        let q = admin.from('profiles').select('id, email, full_name, role, company_id, companies(name)').order('email')
        if (!isSuper) q = q.eq('company_id', me.company_id)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ users: data })
      }
      case 'create_user': {
        const email = (body.email ?? '').trim().toLowerCase()
        const company_id = isSuper ? body.company_id : me.company_id
        const role = body.role ?? 'member'
        const full_name = body.full_name ?? ''
        if (!email) return json({ error: 'Email required' }, 400)
        if (!guardCompany(company_id)) return json({ error: 'Not allowed for that company' }, 403)
        if (!guardRole(role)) return json({ error: 'Not allowed to assign that role' }, 403)

        let userId: string
        if (body.password) {
          const { data, error } = await admin.auth.admin.createUser({
            email, password: body.password, email_confirm: true, user_metadata: { full_name },
          })
          if (error) return json({ error: error.message }, 400)
          userId = data.user.id
        } else {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(email)
          if (error) return json({ error: error.message }, 400)
          userId = data.user.id
        }
        // the handle_new_user trigger creates a bare profile; fill it in
        const { error: pErr } = await admin.from('profiles')
          .upsert({ id: userId, email, full_name, company_id, role }, { onConflict: 'id' })
        if (pErr) return json({ error: pErr.message }, 500)
        return json({ id: userId })
      }
      case 'set_password': {
        const company = await targetCompany(body.user_id)
        if (!guardCompany(company)) return json({ error: 'Not allowed' }, 403)
        if (!body.password) return json({ error: 'Password required' }, 400)
        const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      case 'set_role': {
        const company = await targetCompany(body.user_id)
        if (!guardCompany(company)) return json({ error: 'Not allowed' }, 403)
        if (!guardRole(body.role)) return json({ error: 'Not allowed to assign that role' }, 403)
        const { error } = await admin.from('profiles').update({ role: body.role }).eq('id', body.user_id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      case 'set_company': {
        if (!isSuper) return json({ error: 'Super admin only' }, 403)
        const { error } = await admin.from('profiles').update({ company_id: body.company_id }).eq('id', body.user_id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      case 'delete_user': {
        const company = await targetCompany(body.user_id)
        if (!guardCompany(company)) return json({ error: 'Not allowed' }, 403)
        if (body.user_id === caller.id) return json({ error: 'You cannot delete yourself' }, 400)
        const { error } = await admin.auth.admin.deleteUser(body.user_id)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }

      default:
        return json({ error: 'Unknown action: ' + action }, 400)
    }
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
