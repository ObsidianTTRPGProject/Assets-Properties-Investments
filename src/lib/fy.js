// Australian financial year helpers (1 July – 30 June).
// FY end-year convention: Jul 2026 – Jun 2027 = FY2027 ("FY27").

export function fyOf(dateStr) {
  const d = new Date(dateStr)
  return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear() // month 6 = July
}

export function fyLabel(endYear) {
  return 'FY' + String(endYear % 100).padStart(2, '0')
}

export function fyRange(endYear) {
  return { start: `${endYear - 1}-07-01`, end: `${endYear}-06-30` }
}

// 12 month buckets for an FY, in order Jul..Jun.
export function fyMonths(endYear) {
  const out = []
  for (let i = 0; i < 12; i++) {
    const month = (6 + i) % 12 // 6=Jul
    const year = month >= 6 ? endYear - 1 : endYear
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = new Date(year, month, 1).toLocaleDateString('en-AU', { month: 'short' })
    out.push({ key, label, year, month })
  }
  return out
}

export const monthKey = (dateStr) => {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const DAY = 86400000
export const daysInclusive = (a, b) => Math.floor((new Date(b) - new Date(a)) / DAY) + 1

// Accrued total of a recurring schedule from its start up to `asOf` (date string).
// frequency: weekly | fortnightly | monthly. Honours an optional end_date.
export function scheduleAccrued(schedule, asOf) {
  const start = new Date(schedule.start_date)
  let limit = new Date(asOf)
  if (schedule.end_date) {
    const end = new Date(schedule.end_date)
    if (end < limit) limit = end
  }
  if (limit < start) return 0
  let count = 0
  const d = new Date(start)
  let guard = 0
  while (d <= limit && guard < 20000) {
    count++
    if (schedule.frequency === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + (schedule.frequency === 'fortnightly' ? 14 : 7))
    guard++
  }
  return count * Number(schedule.amount || 0)
}

// Corporate palette — muted navy / slate / teal / clay / gold.
export const PALETTE = {
  income: '#3f7d6e',   // muted teal-green
  expense: '#b06a52',  // muted clay
  net: '#1e3a5f',      // brand navy
  netNeg: '#b06a52',
  depreciation: '#b8923a', // gold
  forecast: '#8aa0b8', // soft slate-blue
  grid: '#e2e8f0',
}

// Pie / multi-series palette (navy → slate → gold → muted accents).
export const SERIES = ['#1e3a5f', '#2c4a73', '#5b7794', '#8aa0b8', '#b8923a', '#3f7d6e', '#b06a52', '#64748b']
