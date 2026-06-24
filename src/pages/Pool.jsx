import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Card, Button, Field, Input, Select } from '../components/ui'
import { money, dateStr } from '../lib/format'

const today = () => new Date().toISOString().slice(0, 10)

export default function Pool() {
  const [contributions, setContributions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [members, setMembers] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)

  // contribution form
  const [cForm, setCForm] = useState(blankC())
  const [cEditId, setCEditId] = useState(null)
  const [cOpen, setCOpen] = useState(false)
  // expense form
  const [eForm, setEForm] = useState(blankE())
  const [eEditId, setEEditId] = useState(null)
  const [eOpen, setEOpen] = useState(false)

  function blankC() { return { member_id: '', amount: '', contributed_on: today(), note: '' } }
  function blankE() { return { description: '', amount: '', spent_on: today(), property_id: '', note: '' } }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [c, e, m, p] = await Promise.all([
      supabase.from('pool_contributions').select('*').order('contributed_on', { ascending: false }),
      supabase.from('pool_expenses').select('*').order('spent_on', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name').order('email'),
      supabase.from('properties').select('id, nickname').order('nickname'),
    ])
    setContributions(c.data || [])
    setExpenses(e.data || [])
    setMembers(m.data || [])
    setProperties(p.data || [])
    setLoading(false)
  }

  const totalIn = contributions.reduce((s, x) => s + Number(x.amount || 0), 0)
  const totalOut = expenses.reduce((s, x) => s + Number(x.amount || 0), 0)
  const balance = totalIn - totalOut

  // Per-member totals
  const byMember = {}
  contributions.forEach((c) => {
    const name = c.member_name || 'Unknown'
    byMember[name] = (byMember[name] || 0) + Number(c.amount || 0)
  })
  const memberTotals = Object.entries(byMember).sort((a, b) => b[1] - a[1])

  // ---- contribution actions ----
  function startAddC() { setCForm(blankC()); setCEditId(null); setCOpen(true) }
  function startEditC(c) {
    setCForm({ member_id: c.member_id || '', amount: c.amount ?? '', contributed_on: c.contributed_on || today(), note: c.note || '' })
    setCEditId(c.id); setCOpen(true)
  }
  async function saveC() {
    if (!cForm.amount) return
    const member = members.find((m) => m.id === cForm.member_id)
    const payload = {
      member_id: cForm.member_id || null,
      member_name: member ? (member.full_name || member.email) : 'Unknown',
      amount: Number(cForm.amount),
      contributed_on: cForm.contributed_on || today(),
      note: cForm.note,
    }
    if (cEditId) await supabase.from('pool_contributions').update(payload).eq('id', cEditId)
    else await supabase.from('pool_contributions').insert(payload)
    setCForm(blankC()); setCEditId(null); setCOpen(false); load()
  }
  async function delC(c) {
    if (!confirm('Delete this contribution?')) return
    await supabase.from('pool_contributions').delete().eq('id', c.id); load()
  }

  // ---- expense actions ----
  function startAddE() { setEForm(blankE()); setEEditId(null); setEOpen(true) }
  function startEditE(x) {
    setEForm({ description: x.description || '', amount: x.amount ?? '', spent_on: x.spent_on || today(), property_id: x.property_id || '', note: x.note || '' })
    setEEditId(x.id); setEOpen(true)
  }
  async function saveE() {
    if (!eForm.description.trim() || !eForm.amount) return
    const payload = {
      description: eForm.description, amount: Number(eForm.amount),
      spent_on: eForm.spent_on || today(), property_id: eForm.property_id || null, note: eForm.note,
    }
    if (eEditId) await supabase.from('pool_expenses').update(payload).eq('id', eEditId)
    else await supabase.from('pool_expenses').insert(payload)
    setEForm(blankE()); setEEditId(null); setEOpen(false); load()
  }
  async function delE(x) {
    if (!confirm('Delete this pool expense?')) return
    await supabase.from('pool_expenses').delete().eq('id', x.id); load()
  }

  const propName = (id) => properties.find((p) => p.id === id)?.nickname

  if (loading) return <p className="text-slate-400">Loading…</p>

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Shared Pool</h1>
      <p className="mb-5 text-sm text-slate-500">Money the team pays in, and what the pool is spent on.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Paid in" value={money(totalIn)} color="text-green-600" />
        <Stat label="Spent" value={money(totalOut)} color="text-red-600" />
        <Stat label="Pool balance" value={money(balance)} color={balance >= 0 ? 'text-brand-700' : 'text-red-600'} />
      </div>

      {memberTotals.length > 0 && (
        <Card className="mb-6 p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-600">Contributed by member</h3>
          <div className="flex flex-wrap gap-3">
            {memberTotals.map(([name, total]) => (
              <div key={name} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-700">{name}</span>{' '}
                <span className="text-slate-500">{money(total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Contributions */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Contributions in</h2>
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
              <Field label="Note"><Input value={cForm.note} onChange={(e) => setCForm({ ...cForm, note: e.target.value })} /></Field>
              <div className="flex gap-2">
                <Button onClick={saveC}>{cEditId ? 'Save' : 'Add contribution'}</Button>
                <Button variant="secondary" onClick={() => { setCOpen(false); setCEditId(null) }}>Cancel</Button>
              </div>
            </div>
          )}
          {contributions.length === 0 ? (
            <p className="text-sm text-slate-400">No contributions yet.</p>
          ) : (
            <div className="space-y-1 text-sm">
              {contributions.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{c.member_name || 'Unknown'}</span>
                    <span className="text-slate-400"> · {dateStr(c.contributed_on)}{c.note ? ` · ${c.note}` : ''}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-green-600">{money(c.amount)}</span>
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
              <Field label="Note"><Input value={eForm.note} onChange={(e) => setEForm({ ...eForm, note: e.target.value })} /></Field>
              <div className="flex gap-2">
                <Button onClick={saveE}>{eEditId ? 'Save' : 'Add expense'}</Button>
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
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{x.description}</span>
                    <span className="text-slate-400"> · {dateStr(x.spent_on)}{propName(x.property_id) ? ` · ${propName(x.property_id)}` : ''}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-red-600">{money(x.amount)}</span>
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
