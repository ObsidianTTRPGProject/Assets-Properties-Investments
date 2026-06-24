import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Card, Badge } from './ui'
import { money, dateStr } from '../lib/format'

// Priority Actions + Recent Changes.
// Pass a propertyId to scope everything to one property (used on the property
// Overview). Omit it for the portfolio-wide dashboard (used on Home).
// Every item links straight to the relevant tab via ?tab=<Tab>.
export default function ActivityPanels({ propertyId = null, compact = false }) {
  const [loading, setLoading] = useState(true)
  const [priority, setPriority] = useState([])
  const [recent, setRecent] = useState([])

  useEffect(() => { load() }, [propertyId])

  const linkTo = (pid, tab) => `/properties/${pid}${tab ? `?tab=${tab}` : ''}`
  const scope = (q) => (propertyId ? q.eq('property_id', propertyId) : q)

  async function load() {
    setLoading(true)
    const todayStr = new Date().toISOString().slice(0, 10)

    const [props, billsRes, tasksRes, reqRes, tenanciesRes, votesRes] = await Promise.all([
      supabase.from('properties').select('id, nickname'),
      scope(supabase.from('bills').select('id, property_id, description, amount, due_date, status').neq('status', 'paid')),
      scope(supabase.from('tasks').select('id, property_id, title, status, priority, created_at').not('status', 'in', '("resolved","closed")')),
      scope(supabase.from('requests').select('id, property_id, title, status, created_at').not('status', 'in', '("resolved","closed")')),
      scope(supabase.from('tenancies').select('id, property_id')),
      scope(supabase.from('votes').select('id, property_id, title, status, created_at').neq('status', 'closed')),
    ])
    const nameOf = {}
    ;(props.data || []).forEach((p) => (nameOf[p.id] = p.nickname))
    const tenancyProp = {}
    ;(tenanciesRes.data || []).forEach((t) => (tenancyProp[t.id] = t.property_id))

    const tIds = (tenanciesRes.data || []).map((t) => t.id)
    let arrears = []
    if (tIds.length) {
      const { data } = await supabase.from('rent_payments').select('id, tenancy_id, due_date, amount_due, status').in('tenancy_id', tIds).in('status', ['missed', 'late'])
      arrears = data || []
    }

    // ---- Priority actions ----
    const actions = []
    ;(billsRes.data || []).forEach((b) => {
      const overdue = b.due_date && b.due_date < todayStr
      actions.push({
        kind: overdue ? 'Overdue bill' : 'Unpaid bill',
        severity: overdue ? 'red' : 'amber',
        title: `${b.description} — ${money(b.amount)}`,
        sub: `${nameOf[b.property_id] || 'Property'}${b.due_date ? ` · due ${dateStr(b.due_date)}` : ''}`,
        link: linkTo(b.property_id, 'Bills'),
        sort: overdue ? 0 : 2,
      })
    })
    ;(arrears || []).forEach((p) => {
      actions.push({
        kind: 'Rent ' + p.status,
        severity: 'red',
        title: `${money(p.amount_due)} ${p.status}`,
        sub: `${nameOf[tenancyProp[p.tenancy_id]] || 'Property'} · due ${dateStr(p.due_date)}`,
        link: linkTo(tenancyProp[p.tenancy_id], 'Tenants'),
        sort: 1,
      })
    })
    ;(tasksRes.data || []).filter((t) => t.priority === 'high').forEach((t) => {
      actions.push({
        kind: 'High-priority task',
        severity: 'red',
        title: t.title,
        sub: `${nameOf[t.property_id] || 'Property'} · ${t.status}`,
        link: linkTo(t.property_id, 'Tasks'),
        sort: 1,
      })
    })
    ;(reqRes.data || []).forEach((r) => {
      actions.push({
        kind: 'Open request',
        severity: 'amber',
        title: r.title,
        sub: `${nameOf[r.property_id] || 'Property'} · ${r.status}`,
        link: linkTo(r.property_id, 'Requests'),
        sort: 3,
      })
    })
    ;(votesRes.data || []).forEach((v) => {
      actions.push({
        kind: 'Open vote',
        severity: 'amber',
        title: v.title,
        sub: `${nameOf[v.property_id] || 'Property'} · needs your decision`,
        link: linkTo(v.property_id, 'Voting'),
        sort: 2,
      })
    })
    actions.sort((a, b) => a.sort - b.sort)
    setPriority(actions)

    // ---- Recent changes ----
    const tenantLogsQ = propertyId
      ? (tIds.length
          ? supabase.from('tenant_logs').select('id, tenancy_id, note, created_at').in('tenancy_id', tIds).order('created_at', { ascending: false }).limit(8)
          : null)
      : supabase.from('tenant_logs').select('id, tenancy_id, note, created_at').order('created_at', { ascending: false }).limit(8)

    const [rp, rt, rb, rr, rv, rl] = await Promise.all([
      scope(supabase.from('properties').select('id, nickname, created_at')).order('created_at', { ascending: false }).limit(8),
      scope(supabase.from('tasks').select('id, property_id, title, created_at')).order('created_at', { ascending: false }).limit(8),
      scope(supabase.from('bills').select('id, property_id, description, created_at')).order('created_at', { ascending: false }).limit(8),
      scope(supabase.from('requests').select('id, property_id, title, created_at')).order('created_at', { ascending: false }).limit(8),
      scope(supabase.from('votes').select('id, property_id, title, result, status, created_at')).order('created_at', { ascending: false }).limit(8),
      tenantLogsQ || Promise.resolve({ data: [] }),
    ])
    const changes = []
    if (!propertyId) {
      ;(rp.data || []).forEach((x) => changes.push({ icon: '🏠', label: `Property added: ${x.nickname}`, link: linkTo(x.id, 'Overview'), at: x.created_at }))
    }
    ;(rt.data || []).forEach((x) => changes.push({ icon: '🛠️', label: `Task: ${x.title}`, link: linkTo(x.property_id, 'Tasks'), at: x.created_at }))
    ;(rb.data || []).forEach((x) => changes.push({ icon: '💸', label: `Bill: ${x.description}`, link: linkTo(x.property_id, 'Bills'), at: x.created_at }))
    ;(rr.data || []).forEach((x) => changes.push({ icon: '📩', label: `Request: ${x.title}`, link: linkTo(x.property_id, 'Requests'), at: x.created_at }))
    ;(rl.data || []).forEach((x) => changes.push({ icon: '📝', label: `Tenant log: ${(x.note || '').slice(0, 40)}`, link: linkTo(tenancyProp[x.tenancy_id] || '', 'Tenants'), at: x.created_at }))
    ;(rv.data || []).forEach((x) => changes.push({ icon: '🗳️', label: `Vote ${x.status === 'closed' ? `closed (${x.result})` : 'raised'}: ${x.title}`, link: linkTo(x.property_id, 'Voting'), at: x.created_at }))
    changes.sort((a, b) => new Date(b.at) - new Date(a.at))
    setRecent(changes.slice(0, compact ? 8 : 12))

    setLoading(false)
  }

  if (loading) return <p className="text-sm text-slate-400">Loading activity…</p>

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Priority Actions */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">⚡ Priority Actions</h2>
          <Badge color={priority.length ? 'red' : 'green'}>{priority.length}</Badge>
        </div>
        {priority.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing needs attention right now.</p>
        ) : (
          <div className="space-y-2">
            {priority.map((a, i) => (
              <Link key={i} to={a.link} className="block rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{a.title}</span>
                  <Badge color={a.severity}>{a.kind}</Badge>
                </div>
                <p className="text-xs text-slate-500">{a.sub}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Recent Changes */}
      <Card className="p-5">
        <h2 className="mb-3 font-medium">🕑 Recent Changes</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No recent activity.</p>
        ) : (
          <div className="space-y-1">
            {recent.map((c, i) => (
              <Link key={i} to={c.link} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                <span className="min-w-0 truncate text-slate-700">{c.icon} {c.label}</span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">{dateStr(c.at)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
