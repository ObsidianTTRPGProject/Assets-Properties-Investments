import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Card, Button, Field, Input, Select, Badge } from '../components/ui'
import { money, dateStr } from '../lib/format'
import { scheduleAccrued, fyOf, fyLabel, fyRange } from '../lib/fy'

const today = () => new Date().toISOString().slice(0, 10)
const CURRENT_FY = fyOf(today())
const FY_END = fyRange(CURRENT_FY).end

export default function Pool() {
  const [contributions, setContributions] = useState([])
  const [schedules, setSchedules] = useState([])
  const [expenses, setExpenses] = useState([])
  const [members, setMembers] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)

  const [cForm, setCForm] = useState(blankC()); const [cEditId, setCEditId] = useState(null); const [cOpen, setCOpen] = useState(false)
  const [sForm, setSForm] = useState(blankS()); const [sEditId, setSEditId] = useState(null); const [sOpen, setSOpen] = useState(false)
  const [eForm, setEForm] = useState(blankE()); const [eEditId, setEEditId] = useState(null); const [eOpen, setEOpen] = useState(false)

  function blankC() { return { member_id: '', amount: '', contributed_on: today(), note: '' } }
  function blankS() { return { member_id: '', amount: '', frequency: 'weekly', start_date: today(), end_date: '', note: '' } }
  function blankE() { return { description: '', amount: '', spent_on: today(), property_id: '', note: '' } }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [c, s, e, m, p] = await Promise.all([
      supabase.from('pool_contributions').select('*').order('contributed_on', { ascending: false }),
      supabase.from('pool_schedules').select('*').order('start_date', { ascending: false }),
      supabase.from('pool_expenses').select('*').order('spent_on', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name').order('email'),
      supabase.from('properties').select('id, nickname').order('nickname'),
    ])
    setContributions(c.data || []); setSchedules(s.data || []); setExpenses(e.data || [])
    setMembers(m.data || []); setProperties(p.data || [])
    setLoading(false)
  }

  const memberLabel = (id) => { const m = members.find((x) => x.id === id); return m ? (m.full_name || m.email) : 'Unknown' }

  const manualIn = contributions.reduce((s, x) => s + Number(x.amount || 0), 0)
  const accruedNow = schedules.reduce((s, x) => s + scheduleAccrued(x, today()), 0)
  const paidIn = manualIn + accruedNow
  const spent = expenses.reduce((s, x) => s + Number(x.amount || 0), 0)
  const balance = paidIn - spent

  // Forecast to end of current FY (scheduled contributions accrue forward).
  const accruedFyEnd = schedules.reduce((s, x) => s + scheduleAccrued(x, FY_END), 0)
  const projectedBalance = manualIn + accruedFyEnd - spent

  // Per-member totals (manual + accrued-to-date)
  const byMember = {}
  contributions.forEach((c) => { const k = c.member_name || 'Unknown'; byMember[k] = (byMember[k] || 0) + Number(c.amount || 0) })
  schedules.forEach((s) => { const k = s.member_name || 'Unknown'; byMember[k] = (byMember[k] || 0) + scheduleAccrued(s, today()) })
  const memberTotals = Object.entries(byMember).sort((a, b) => b[1] - a[1])

  // ---- contributions ----
  function startAddC() { setCForm(blankC()); setCEditId(null); setCOpen(true) }
  function startEditC(c) { setCForm({ member_id: c.member_id || '', amount: c.amount ?? '', contributed_on: c.contributed_on || today(), note: c.note || '' }); setCEditId(c.id); setCOpen(true) }
  async function saveC() {
    if (!cForm.amount) return
    const m = members.find((x) => x.id === cForm.member_id)
    const payload = { member_id: cForm.member_id || null, member_name: m ? (m.full_name || m.email) : 'Unknown', amount: Number(cForm.amount), contributed_on: cForm.contributed_on || today(), note: cForm.note }
    if (cEditId) await supabase.from('pool_contributions').update(payload).eq('id', cEditId)
    else await supabase.from('pool_contributions').insert(payload)
    setCForm(blankC()); setCEditId(null); setCOpen(false); load()
  }
  async function delC(c) { if (!confirm('Delete this contribution?')) return; await supabase.from('pool_contributions').delete().eq('id', c.id); load() }

  // ---- schedules ----
  function startAddS() { setSForm(blankS()); setSEditId(null); setSOpen(true) }
  function startEditS(s) { setSForm({ member_id: s.member_id || '', amount: s.amount ?? '', frequency: s.frequency || 'weekly', start_date: s.start_date || today(), end_date: s.end_date || '', note: s.note || '' }); setSEditId(s.id); setSOpen(true) }
  async function saveS() {
    if (!sForm.amount || !sForm.start_date) return
    const m = members.find((x) => x.id === sForm.member_id)
    const payload = { member_id: sForm.member_id || null, member_name: m ? (m.full_name || m.email) : 'Unknown', amount: Number(sForm.amount), frequency: sForm.frequency, start_date: sForm.start_date, end_date: sForm.end_date || null, note: sForm.note }
    if (sEditId) await supabase.from('pool_schedules').update(payload).eq('id', sEditId)
    else await supabase.from('pool_schedules').insert(payload)
    setSForm(blankS()); setSEditId(null); setSOpen(false); load()
  }
  async function delS(s) { if (!confirm('Delete this recurring contribution?')) return; await supabase.from('pool_schedules').delete().eq('id', s.id); load() }

  // ---- expenses ----
  function startAddE() { setEForm(blankE()); setEEditId(null); setEOpen(true) }
  function startEditE(x) { setEForm({ description: x.description || '', amount: x.amount ?? '', spent_on: x.spent_on || today(), property_id: x.property_id || '', note: x.note || '' }); setEEditId(x.id); setEOpen(true) }
  async function saveE() {
    if (!eForm.description.trim() || !eForm.amount) return
    const payload = { description: eForm.description, amount: Number(eForm.amount), spent_on: eForm.spent_on || today(), property_id: eForm.property_id || null, note: eForm.note }
    if (eEditId) await supabase.from('pool_expenses').update(payload).eq('id', eEditId)
    else await supabase.from('pool_expenses').insert(payload)
    setEForm(blankE()); setEEditId(null); setEOpen(false); load()
  }
  async function delE(x) { if (!confirm('Delete this pool expense?')) return; await supabase.from('pool_expenses').delete().eq('id', x.id); load() }

  const propName = (id) => properties.find((p) => p.id === id)?.nickname

  if (loading) return <p className="text-slate-400">Loading…</p>

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Shared Pool</h1>
      <p className="mb-5 text-sm text-slate-500">Contributions in (one-off and recurring), and what the pool is spent on.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Paid in (to date)" value={money(paidIn)} color="text-brand-700" />
        <Stat label="Spent" value={money(spent)} color="text-[#b06a52]" />
        <Stat label="Balance now" value={money(balance)} color={balance >= 0 ? 'text-brand-700' : 'text-[#b06a52]'} />
        <Stat label={`Projected at ${fyLabel(CURRENT_FY)} end`} value={money(projectedBalance)} color="text-slate-500" />
      </div>

      {memberTotals.length > 0 && (
        <Card className="mb-6 p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-600">Contributed by member (incl. recurring to date)</h3>
          <div className="flex flex-wrap gap-3">
            {memberTotals.map(([name, total]) => (
              <div key={name} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-700">{name}</span> <span className="text-slate-500">{money(total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recurring contributions */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-medium">Recurring contributions</h2>
            <p className="text-xs text-slate-400">Set once — these accrue automatically and feed forecasts. Change the amount by editing, or end one and add another from a new date.</p>
          </div>
          <Button onClick={() => (sOpen ? setSOpen(false) : startAddS())}>{sOpen ? 'Close' : '+ Add'}</Button>
        </div>
        {sOpen && (
          <div className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3">
            <Field label="Member">
              <Select value={sForm.member_id} onChange={(e) => setSForm({ ...sForm, member_id: e.target.value })}>
                <option value="">— select —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Amount (AUD)"><Input type="number" value={sForm.amount} onChange={(e) => setSForm({ ...sForm, amount: e.target.value })} /></Field>
              <Field label="Frequency">
                <Select value={sForm.frequency} onChange={(e) => setSForm({ ...sForm, frequency: e.target.value })}>
                  <option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option>
                </Select>
              </Field>
              <Field label="From"><Input type="date" value={sForm.start_date} onChange={(e) => setSForm({ ...sForm, start_date: e.target.value })} /></Field>
              <Field label="Until (optional)"><Input type="date" value={sForm.end_date} onChange={(e) => setSForm({ ...sForm, end_date: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveS}>{sEditId ? 'Save' : 'Add recurring'}</Button>
              <Button variant="secondary" onClick={() => { setSOpen(false); setSEditId(null) }}>Cancel</Button>
            </div>
          </div>
        )}
        {schedules.length === 0 ? (
          <p className="text-sm text-slate-400">No recurring contributions set.</p>
        ) : (
          <div className="space-y-1 text-sm">
            {schedules.map((s) => {
              const ongoing = !s.end_date || s.end_date >= today()
              return (
                <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{s.member_name || 'Unknown'}</span>
                    <span className="text-slate-500"> · {money(s.amount)} {s.frequency} · from {dateStr(s.start_date)}{s.end_date ? ` to ${dateStr(s.end_date)}` : ''}</span>
                    {ongoing ? <Badge color="green">active</Badge> : <Badge color="slate">ended</Badge>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-slate-400">accrued {money(scheduleAccrued(s, today()))}</span>
                    <button onClick={() => startEditS(s)} className="text-xs text-brand-600 hover:underline">Edit</button>
                    <button onClick={() => delS(s)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* One-off contributions */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">One-off contributions</h2>
            <Button onClick={() => (cOpen ? setCOpen(false) : startAddC())}>{cOpen ? 'Close' : '+ Add'}</Button>
          </div>
          {cOpen && (
            <div className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3">
              <Field label="Member">
                <Select value={cForm.member_id} onChange={(e) => setCForm({ ...cForm, member_id: e.target.value })}>
                  <option value="">— select —</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (AUD)"><Input type="number" value={cForm.amount} onChange={(e) => setCForm({ ...cForm, amount: e.target.value })} /></Field>
                <Field label="Date"><Input type="date" value={cForm.contributed_on} onChange={(e) => setCForm({ ...cForm, contributed_on: e.target.value })} /></Field>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveC}>{cEditId ? 'Save' : 'Add'}</Button>
                <Button variant="secondary" onClick={() => { setCOpen(false); setCEditId(null) }}>Cancel</Button>
              </div>
            </div>
          )}
          {contributions.length === 0 ? (
            <p className="text-sm text-slate-400">No one-off contributions.</p>
          ) : (
            <div className="space-y-1 text-sm">
              {contributions.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
                  <div className="min-w-0"><span className="font-medium text-slate-700">{c.member_name || 'Unknown'}</span><span className="text-slate-400"> · {dateStr(c.contributed_on)}</span></div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-brand-700">{money(c.amount)}</span>
                    <button onClick={() => startEditC(c)} className="text-xs text-brand-600 hover:underline">Edit</button>
                    <button onClick={() => delC(c)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expenses */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Paid from pool</h2>
            <Button onClick={() => (eOpen ? setEOpen(false) : startAddE())}>{eOpen ? 'Close' : '+ Add'}</Button>
          </div>
          {eOpen && (
            <div className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3">
              <Field label="Description"><Input value={eForm.description} onChange={(e) => setEForm({ ...eForm, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (AUD)"><Input type="number" value={eForm.amount} onChange={(e) => setEForm({ ...eForm, amount: e.target.value })} /></Field>
                <Field label="Date"><Input type="date" value={eForm.spent_on} onChange={(e) => setEForm({ ...eForm, spent_on: e.target.value })} /></Field>
              </div>
              <Field label="Related property (optional)">
                <Select value={eForm.property_id} onChange={(e) => setEForm({ ...eForm, property_id: e.target.value })}>
                  <option value="">— none —</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                </Select>
              </Field>
              <div className="flex gap-2">
                <Button onClick={saveE}>{eEditId ? 'Save' : 'Add'}</Button>
                <Button variant="secondary" onClick={() => { setEOpen(false); setEEditId(null) }}>Cancel</Button>
              </div>
            </div>
          )}
          {expenses.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing paid from the pool yet.</p>
          ) : (
            <div className="space-y-1 text-sm">
              {expenses.map((x) => (
                <div key={x.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
                  <div className="min-w-0"><span className="font-medium text-slate-700">{x.description}</span><span className="text-slate-400"> · {dateStr(x.spent_on)}{propName(x.property_id) ? ` · ${propName(x.property_id)}` : ''}</span></div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-[#b06a52]">{money(x.amount)}</span>
                    <button onClick={() => startEditE(x)} className="text-xs text-brand-600 hover:underline">Edit</button>
                    <button onClick={() => delE(x)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
    </Card>
  )
}
