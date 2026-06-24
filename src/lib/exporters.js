import { supabase } from './supabaseClient'
import { getCashflow } from './finance'
import { fyRange, fyLabel } from './fy'
import { depreciationForFY } from './depreciation'

// Gather everything an accountant needs for one financial year.
export async function buildAccountantReport(endYear) {
  const { start, end } = fyRange(endYear)
  const allEvents = await getCashflow()
  const events = allEvents.filter((e) => e.date >= start && e.date <= end)

  const { data: props } = await supabase.from('properties').select('id, nickname')
  const nameOf = {}
  ;(props || []).forEach((p) => (nameOf[p.id] = p.nickname))

  const { data: depItems } = await supabase.from('depreciation_items').select('*')

  const transactions = events
    .map((e) => ({
      date: e.date,
      property: nameOf[e.property_id] || '',
      type: e.direction,
      category: e.category,
      description: e.description || '',
      amount: Number(e.amount || 0),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const income = events.filter((e) => e.direction === 'income').reduce((s, e) => s + e.amount, 0)
  const expense = events.filter((e) => e.direction === 'expense').reduce((s, e) => s + e.amount, 0)

  const catMap = {}
  events.forEach((e) => {
    const k = `${e.direction}|${e.category || 'uncategorised'}`
    catMap[k] = (catMap[k] || 0) + e.amount
  })
  const byCategory = Object.entries(catMap).map(([k, v]) => {
    const [type, category] = k.split('|')
    return { type, category, amount: v }
  })

  const depreciation = (depItems || []).map((it) => {
    const d = depreciationForFY(it, endYear)
    return {
      property: nameOf[it.property_id] || '',
      description: it.description,
      method: it.method === 'diminishing' ? 'Diminishing Value' : 'Prime Cost',
      cost: Number(it.cost || 0),
      rate: Number(it.rate || 0),
      fyDeduction: d.fyDeduction,
      accumulated: d.accumulated,
      wdv: d.wdv,
    }
  })
  const depTotal = depreciation.reduce((s, r) => s + r.fyDeduction, 0)

  return {
    endYear, label: fyLabel(endYear), start, end,
    transactions, byCategory, depreciation,
    income, expense, netCash: income - expense, depTotal, taxable: income - expense - depTotal,
  }
}

const n2 = (v) => (Number(v) || 0).toFixed(2)
const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function reportToCSV(r) {
  const rows = []
  rows.push([`API financial report ${r.label}`, `${r.start} to ${r.end}`])
  rows.push([])
  rows.push(['SUMMARY'])
  rows.push(['Income', n2(r.income)])
  rows.push(['Cash expenses', n2(r.expense)])
  rows.push(['Net cash', n2(r.netCash)])
  rows.push(['Depreciation (non-cash)', n2(r.depTotal)])
  rows.push(['Taxable position', n2(r.taxable)])
  rows.push([])
  rows.push(['TRANSACTIONS'])
  rows.push(['Date', 'Property', 'Type', 'Category', 'Description', 'Amount'])
  r.transactions.forEach((t) => rows.push([t.date, t.property, t.type, t.category, t.description, n2(t.amount)]))
  rows.push([])
  rows.push(['DEPRECIATION SCHEDULE'])
  rows.push(['Property', 'Asset', 'Method', 'Cost', 'Rate %', 'FY deduction', 'Accumulated', 'Written-down value'])
  r.depreciation.forEach((d) => rows.push([d.property, d.description, d.method, n2(d.cost), d.rate, n2(d.fyDeduction), n2(d.accumulated), n2(d.wdv)]))
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function download(filename, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function exportCSV(r) {
  download(`API-${r.label}.csv`, new Blob([reportToCSV(r)], { type: 'text/csv' }))
}

// Excel — xlsx is loaded only when needed.
export async function exportXLSX(r) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const summary = [
    [`API financial report ${r.label}`],
    [`${r.start} to ${r.end}`],
    [],
    ['Income', Number(r.income)],
    ['Cash expenses', Number(r.expense)],
    ['Net cash', Number(r.netCash)],
    ['Depreciation (non-cash)', Number(r.depTotal)],
    ['Taxable position', Number(r.taxable)],
    [],
    ['By category', 'Type', 'Amount'],
    ...r.byCategory.map((c) => [c.category, c.type, Number(c.amount)]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')
  const txns = [['Date', 'Property', 'Type', 'Category', 'Description', 'Amount'],
    ...r.transactions.map((t) => [t.date, t.property, t.type, t.category, t.description, Number(t.amount)])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txns), 'Transactions')
  const dep = [['Property', 'Asset', 'Method', 'Cost', 'Rate %', 'FY deduction', 'Accumulated', 'Written-down value'],
    ...r.depreciation.map((d) => [d.property, d.description, d.method, Number(d.cost), Number(d.rate), Number(d.fyDeduction), Number(d.accumulated), Number(d.wdv)])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dep), 'Depreciation')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  download(`API-${r.label}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

// PDF — open a clean printable report; the browser's "Save as PDF" produces the file.
export function exportPDF(r) {
  const m = (v) => '$' + (Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const w = window.open('', '_blank')
  if (!w) { alert('Please allow pop-ups to export the PDF.'); return }
  const rowsTxn = r.transactions.map((t) =>
    `<tr><td>${t.date}</td><td>${t.property}</td><td>${t.type}</td><td>${t.category}</td><td>${t.description}</td><td class="r">${m(t.amount)}</td></tr>`).join('')
  const rowsDep = r.depreciation.map((d) =>
    `<tr><td>${d.property}</td><td>${d.description}</td><td>${d.method}</td><td class="r">${m(d.cost)}</td><td class="r">${d.rate}%</td><td class="r">${m(d.fyDeduction)}</td><td class="r">${m(d.accumulated)}</td></tr>`).join('')
  w.document.write(`<!doctype html><html><head><title>API ${r.label}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:32px;font-size:12px}
      h1{color:#1e3a5f;font-size:20px;margin:0 0 2px} .sub{color:#64748b;margin:0 0 18px}
      h2{color:#1e3a5f;font-size:14px;margin:22px 0 6px;border-bottom:2px solid #b8923a;padding-bottom:3px}
      table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e2e8f0}
      th{color:#64748b;font-weight:600} .r{text-align:right} .sumtbl td{border:none;padding:3px 8px}
      .tot{font-weight:700;color:#1e3a5f}
      @media print{button{display:none}}
    </style></head><body>
    <h1>API — Financial Report ${r.label}</h1>
    <p class="sub">${r.start} to ${r.end}</p>
    <button onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;background:#1e3a5f;color:#fff;border:0;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
    <h2>Summary</h2>
    <table class="sumtbl">
      <tr><td>Income</td><td class="r">${m(r.income)}</td></tr>
      <tr><td>Cash expenses</td><td class="r">${m(r.expense)}</td></tr>
      <tr><td class="tot">Net cash</td><td class="r tot">${m(r.netCash)}</td></tr>
      <tr><td>Depreciation (non-cash)</td><td class="r">${m(r.depTotal)}</td></tr>
      <tr><td class="tot">Taxable position</td><td class="r tot">${m(r.taxable)}</td></tr>
    </table>
    <h2>Transactions</h2>
    <table><thead><tr><th>Date</th><th>Property</th><th>Type</th><th>Category</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${rowsTxn || '<tr><td colspan=6>None</td></tr>'}</tbody></table>
    <h2>Depreciation schedule</h2>
    <table><thead><tr><th>Property</th><th>Asset</th><th>Method</th><th class="r">Cost</th><th class="r">Rate</th><th class="r">FY deduction</th><th class="r">Accumulated</th></tr></thead><tbody>${rowsDep || '<tr><td colspan=7>None</td></tr>'}</tbody></table>
    </body></html>`)
  w.document.close()
}
