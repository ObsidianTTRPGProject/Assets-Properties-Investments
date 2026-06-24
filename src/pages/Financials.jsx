import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { getCashflow } from '../lib/finance'
import { fyOf, fyLabel, fyRange, fyMonths, monthKey, daysInclusive, PALETTE, SERIES } from '../lib/fy'
import { depreciationForFY } from '../lib/depreciation'
import { buildAccountantReport, exportCSV, exportXLSX, exportPDF } from '../lib/exporters'
import { Card, Button } from '../components/ui'
import { money } from '../lib/format'

const TODAY = new Date().toISOString().slice(0, 10)
const CURRENT_FY = fyOf(TODAY)
const periodDays = (f) => (f === 'monthly' ? 30 : f === 'fortnightly' ? 14 : 7)

export default function Financials() {
  const [events, setEvents] = useState([])
  const [properties, setProperties] = useState([])
  const [depItems, setDepItems] = useState([])
  const [tenancies, setTenancies] = useState([])
  const [fy, setFy] = useState(CURRENT_FY)
  const [propFilter, setPropFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busyExport, setBusyExport] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: props }, ev, { data: dep }, { data: tn }] = await Promise.all([
      supabase.from('properties').select('id, nickname'),
      getCashflow(),
      supabase.from('depreciation_items').select('*'),
      supabase.from('tenancies').select('property_id, rent_amount, rent_frequency, move_in, move_out'),
    ])
    setProperties(props || [])
    setEvents(ev)
    setDepItems(dep || [])
    setTenancies(tn || [])
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400">Loading…</p>

  // FY options from data + current/next
  const fySet = new Set(events.map((e) => fyOf(e.date)))
  fySet.add(CURRENT_FY); fySet.add(CURRENT_FY + 1)
  const fyOptions = [...fySet].sort((a, b) => b - a)

  const inScope = (pid) => propFilter === 'all' || pid === propFilter
  const { start, end } = fyRange(fy)
  const fyEvents = events.filter((e) => inScope(e.property_id) && e.date >= start && e.date <= end)

  const income = fyEvents.filter((e) => e.direction === 'income').reduce((s, e) => s + e.amount, 0)
  const expense = fyEvents.filter((e) => e.direction === 'expense').reduce((s, e) => s + e.amount, 0)
  const netCash = income - expense

  const depScoped = depItems.filter((d) => inScope(d.property_id))
  const depreciation = depScoped.reduce((s, it) => s + depreciationForFY(it, fy).fyDeduction, 0)
  const taxable = netCash - depreciation

  // Monthly position
  const months = fyMonths(fy)
  const monthMap = {}
  months.forEach((m) => (monthMap[m.key] = { ...m, income: 0, expense: 0, net: 0 }))
  fyEvents.forEach((e) => {
    const b = monthMap[monthKey(e.date)]
    if (!b) return
    b[e.direction] += e.amount
    b.net += e.direction === 'income' ? e.amount : -e.amount
  })
  const monthly = months.map((m) => monthMap[m.key])

  // Averages (over elapsed months of the FY)
  let monthsElapsed = 12
  if (end < TODAY) monthsElapsed = 12
  else if (start > TODAY) monthsElapsed = 0
  else {
    const s = new Date(start), t = new Date(TODAY)
    monthsElapsed = (t.getFullYear() - s.getFullYear()) * 12 + (t.getMonth() - s.getMonth()) + 1
  }
  const avg = (v) => (monthsElapsed ? v / monthsElapsed : 0)

  // Forecast (current FY only): actual + projected rent from active tenancies to FY end
  const isCurrentFy = start <= TODAY && TODAY <= end
  let projectedRent = 0
  if (isCurrentFy) {
    const daysRemaining = Math.max(daysInclusive(TODAY, end) - 1, 0)
    tenancies.filter((t) => !t.move_out && inScope(t.property_id) && t.rent_amount).forEach((t) => {
      projectedRent += (Number(t.rent_amount) / periodDays(t.rent_frequency)) * daysRemaining
    })
  }
  const forecastNetCash = netCash + projectedRent

  // Expense by category
  const catMap = {}
  fyEvents.filter((e) => e.direction === 'expense').forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount })
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value }))

  async function runExport(kind) {
    setBusyExport(kind)
    try {
      const report = await buildAccountantReport(fy)
      if (kind === 'csv') exportCSV(report)
      else if (kind === 'xlsx') await exportXLSX(report)
      else exportPDF(report)
    } catch (e) {
      alert('Export failed: ' + e.message)
    }
    setBusyExport('')
  }

  const axisFmt = (v) => `$${Math.round(v / 1000)}k`

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financials</h1>
          <p className="text-sm text-slate-500">{fyLabel(fy)} · 1 Jul {fy - 1} – 30 Jun {fy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={fy} onChange={(e) => setFy(Number(e.target.value))}>
            {fyOptions.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={propFilter} onChange={(e) => setPropFilter(e.target.value)}>
            <option value="all">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </div>
      </div>

      {/* Export bar */}
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm text-slate-500">Tax accountant export ({fyLabel(fy)}, all properties):</span>
        <Button variant="secondary" onClick={() => runExport('csv')} disabled={!!busyExport}>{busyExport === 'csv' ? '…' : 'CSV'}</Button>
        <Button variant="secondary" onClick={() => runExport('xlsx')} disabled={!!busyExport}>{busyExport === 'xlsx' ? '…' : 'Excel'}</Button>
        <Button variant="secondary" onClick={() => runExport('pdf')} disabled={!!busyExport}>{busyExport === 'pdf' ? '…' : 'PDF'}</Button>
      </Card>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Income" value={money(income)} />
        <Stat label="Cash expenses" value={money(expense)} />
        <Stat label="Net cash" value={money(netCash)} accent={netCash >= 0 ? PALETTE.net : PALETTE.expense} />
        <Stat label="Depreciation" value={money(depreciation)} accent={PALETTE.depreciation} />
        <Stat label="Taxable position" value={money(taxable)} accent={taxable >= 0 ? PALETTE.net : PALETTE.expense} />
      </div>

      {/* Averages + forecast */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">Average per month {monthsElapsed ? `(over ${monthsElapsed} mo)` : ''}</p>
          <Row k="Income" v={money(avg(income))} />
          <Row k="Expenses" v={money(avg(expense))} />
          <Row k="Net" v={money(avg(netCash))} />
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">Monthly position</p>
          <Row k="Best month (net)" v={money(Math.max(0, ...monthly.map((m) => m.net)))} />
          <Row k="This FY net" v={money(netCash)} />
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">End-of-FY forecast</p>
          {isCurrentFy ? (
            <>
              <Row k="Projected rent to 30 Jun" v={money(projectedRent)} />
              <Row k="Forecast net cash" v={money(forecastNetCash)} accent />
              <p className="mt-1 text-xs text-slate-400">From current tenancies' rent. Excludes future bills.</p>
            </>
          ) : start > TODAY ? (
            <p className="text-sm text-slate-400">Future year — no actuals yet.</p>
          ) : (
            <p className="text-sm text-slate-400">Completed year — figures are final.</p>
          )}
        </Card>
      </div>

      {/* Monthly chart */}
      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-medium">Income vs expenses by month</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly}>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={axisFmt} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
            <Bar dataKey="income" name="Income" fill={PALETTE.income} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" name="Expenses" fill={PALETTE.expense} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-medium">Net position by month</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly}>
              <CartesianGrid stroke={PALETTE.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={axisFmt} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="net" name="Net">
                {monthly.map((m, i) => <Cell key={i} fill={m.net >= 0 ? PALETTE.net : PALETTE.expense} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-medium">Expenses by category</h2>
          {catData.length === 0 ? <p className="text-slate-400">No expenses this year.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" outerRadius={90} label={(d) => d.name}>
                  {catData.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Monthly table */}
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Income</th><th className="px-4 py-2 text-right">Expenses</th><th className="px-4 py-2 text-right">Net</th></tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.key} className="border-t border-slate-100">
                <td className="px-4 py-2">{m.label} {m.year}</td>
                <td className="px-4 py-2 text-right">{money(m.income)}</td>
                <td className="px-4 py-2 text-right">{money(m.expense)}</td>
                <td className="px-4 py-2 text-right font-medium" style={{ color: m.net >= 0 ? PALETTE.net : PALETTE.expense }}>{money(m.net)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td className="px-4 py-2">{fyLabel(fy)} total</td>
              <td className="px-4 py-2 text-right">{money(income)}</td>
              <td className="px-4 py-2 text-right">{money(expense)}</td>
              <td className="px-4 py-2 text-right" style={{ color: netCash >= 0 ? PALETTE.net : PALETTE.expense }}>{money(netCash)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl font-semibold" style={{ color: accent || '#1e293b' }}>{value}</p>
    </Card>
  )
}

function Row({ k, v, accent }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1 text-sm">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium" style={{ color: accent ? '#1e3a5f' : '#334155' }}>{v}</span>
    </div>
  )
}
