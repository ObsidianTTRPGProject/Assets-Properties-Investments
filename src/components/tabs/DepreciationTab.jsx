import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Card, Button, Field, Input, Select, Badge } from '../ui'
import { money, dateStr } from '../../lib/format'
import { fyOf, fyLabel } from '../../lib/fy'
import { depreciationForFY } from '../../lib/depreciation'

const CURRENT_FY = fyOf(new Date().toISOString().slice(0, 10))

export default function DepreciationTab({ propertyId }) {
  const [items, setItems] = useState([])
  const [fy, setFy] = useState(CURRENT_FY)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(blank())
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  function blank() {
    return { description: '', asset_type: 'capital_works', cost: '', method: 'prime', rate: '2.5', effective_life: '', start_date: '', note: '' }
  }

  useEffect(() => { load() }, [propertyId])

  async function load() {
    const { data } = await supabase.from('depreciation_items').select('*').eq('property_id', propertyId).order('start_date')
    setItems(data || [])
  }

  function startAdd() { setForm(blank()); setEditingId(null); setShowForm(true) }
  function startEdit(it) {
    setForm({
      description: it.description || '', asset_type: it.asset_type || 'capital_works', cost: it.cost ?? '',
      method: it.method || 'prime', rate: it.rate ?? '', effective_life: it.effective_life ?? '',
      start_date: it.start_date || '', note: it.note || '',
    })
    setEditingId(it.id); setShowForm(true)
  }

  async function save() {
    if (!form.description.trim() || !form.cost || !form.rate || !form.start_date) return
    const payload = {
      property_id: propertyId, description: form.description, asset_type: form.asset_type,
      cost: Number(form.cost), method: form.method, rate: Number(form.rate),
      effective_life: form.effective_life ? Number(form.effective_life) : null,
      start_date: form.start_date, note: form.note,
    }
    if (editingId) await supabase.from('depreciation_items').update(payload).eq('id', editingId)
    else await supabase.from('depreciation_items').insert(payload)
    setForm(blank()); setEditingId(null); setShowForm(false); load()
  }

  async function del(it) {
    if (!confirm(`Delete depreciation asset "${it.description}"?`)) return
    await supabase.from('depreciation_items').delete().eq('id', it.id); load()
  }

  const rows = items.map((it) => ({ it, ...depreciationForFY(it, fy) }))
  const fyTotal = rows.reduce((s, r) => s + r.fyDeduction, 0)
  const fyOptions = [CURRENT_FY - 2, CURRENT_FY - 1, CURRENT_FY, CURRENT_FY + 1]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">Depreciation</h2>
          <p className="text-sm text-slate-500">{fyLabel(fy)} deduction for this property: <span className="font-medium text-brand-700">{money(fyTotal)}</span></p>
        </div>
        <div className="flex gap-2">
          <Select value={fy} onChange={(e) => setFy(Number(e.target.value))}>
            {fyOptions.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </Select>
          <Button onClick={() => (showForm ? setShowForm(false) : startAdd())}>{showForm ? 'Close' : '+ Asset'}</Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-5 space-y-3 p-4">
          <h3 className="text-sm font-medium">{editingId ? 'Edit asset' : 'New depreciable asset'}</h3>
          <Field label="Description *"><Input value={form.description} onChange={set('description')} placeholder="e.g. Building (capital works), Carpet, Aircon" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.asset_type} onChange={set('asset_type')}>
                <option value="capital_works">Capital works (building)</option>
                <option value="plant">Plant &amp; equipment</option>
              </Select>
            </Field>
            <Field label="Cost (AUD) *"><Input type="number" value={form.cost} onChange={set('cost')} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Method">
              <Select value={form.method} onChange={set('method')}>
                <option value="prime">Prime Cost (straight-line)</option>
                <option value="diminishing">Diminishing Value</option>
              </Select>
            </Field>
            <Field label="Rate % per year *"><Input type="number" step="0.01" value={form.rate} onChange={set('rate')} /></Field>
            <Field label="Effective life (yrs)"><Input type="number" value={form.effective_life} onChange={set('effective_life')} placeholder="optional" /></Field>
          </div>
          <Field label="Start date (acquired/available) *"><Input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
          <Field label="Note"><Input value={form.note} onChange={set('note')} /></Field>
          <p className="text-xs text-slate-400">Tip: capital works is usually Prime Cost at 2.5%. Plant &amp; equipment often uses Diminishing Value at 200% ÷ effective life.</p>
          <div className="flex gap-2">
            <Button onClick={save}>{editingId ? 'Save changes' : 'Add asset'}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="text-slate-400">No depreciable assets recorded.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Asset</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">{fyLabel(fy)} deduction</th>
                <th className="px-4 py-2 text-right">Accumulated</th>
                <th className="px-4 py-2 text-right">Written-down</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ it, fyDeduction, accumulated, wdv }) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium">{it.description}</div>
                    <div className="text-xs text-slate-400">{it.asset_type === 'plant' ? 'Plant & equipment' : 'Capital works'} · from {dateStr(it.start_date)}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{it.method === 'diminishing' ? 'Diminishing' : 'Prime cost'}</td>
                  <td className="px-4 py-2 text-right">{money(it.cost)}</td>
                  <td className="px-4 py-2 text-right">{it.rate}%</td>
                  <td className="px-4 py-2 text-right font-medium text-brand-700">{money(fyDeduction)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{money(accumulated)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{money(wdv)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => startEdit(it)} className="text-brand-600 hover:underline">Edit</button>
                      <button onClick={() => del(it)} className="text-red-500 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
