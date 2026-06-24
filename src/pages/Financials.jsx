import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { getCashflow, summariseByYear } from '../lib/finance'
import { Card } from '../components/ui'
import { money } from '../lib/format'

const PIE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']

export default function Financials() {
  const [events, setEvents] = useState([])
  const [properties, setProperties] = useState([])
  const [propFilter, setPropFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: props }, ev] = await Promise.all([
      supabase.from('properties').select('id, nickname'),
      getCashflow(),
    ])
    setProperties(props || [])
    setEvents(ev)
    setLoading(false)
  }

  const scoped = propFilter === 'all' ? events : events.filter((e) => e.property_id === propFilter)
  const years = summariseByYear(scoped)
  const totalIn = scoped.filter((e) => e.direction === 'income').reduce((s, e) => s + e.amount, 0)
  const totalOut = scoped.filter((e) => e.direction === 'expense').reduce((s, e) => s + e.amount, 0)

  // Expense-by-category across the scope.
  const catMap = {}
  scoped.filter((e) => e.direction === 'expense').forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount })
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value }))

  function exportCsv() {
    const rows = [['Year', 'Income', 'Expense', 'Net']]
    years.forEach((y) => rows.push([y.year, y.income, y.expense, y.net]))
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'financial-summary.csv'
    a.click()
  }

  if (loading) return <p className="text-slate-400">Loading…</p>

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Financial Summary</h1>
        <div className="flex gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={propFilter} onChange={(e) => setPropFilter(e.target.value)}>
            <option value="all">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
          <button onClick={exportCsv} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total income" value={money(totalIn)} color="text-green-600" />
        <Stat label="Total expenses" value={money(totalOut)} color="text-red-600" />
        <Stat label="Net position" value={money(totalIn - totalOut)} color={totalIn - totalOut >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      {years.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">No financial data yet. Add bills and rent payments to see the summary.</Card>
      ) : (
        <>
          <Card className="mb-6 p-5">
            <h2 className="mb-4 font-medium">Income vs Expenses by year</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={years}>
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="income" name="Income" fill="#16a34a" />
                <Bar dataKey="expense" name="Expense" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 font-medium">Net cash flow by year</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={years}>
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Bar dataKey="net" name="Net">
                    {years.map((y, i) => <Cell key={i} fill={y.net >= 0 ? '#16a34a' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 font-medium">Expenses by category</h2>
              {catData.length === 0 ? <p className="text-slate-400">No expenses.</p> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={catData} dataKey="value" nameKey="name" outerRadius={90} label={(d) => d.name}>
                      {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr><th className="px-4 py-2">Year</th><th className="px-4 py-2 text-right">Income</th><th className="px-4 py-2 text-right">Expenses</th><th className="px-4 py-2 text-right">Net</th></tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{y.year}</td>
                    <td className="px-4 py-2 text-right text-green-600">{money(y.income)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{money(y.expense)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${y.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(y.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
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
