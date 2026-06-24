import { fyOf, fyRange, daysInclusive } from './fy'

// Compute an asset's depreciation for a target financial year (end-year).
// Iterates each FY from acquisition so the diminishing-value written-down
// value carries correctly, and pro-rates the first year by days held.
// Returns { fyDeduction, accumulated, wdv } as at the end of `endYear`.
export function depreciationForFY(item, endYear) {
  const cost = Number(item.cost || 0)
  const rate = Number(item.rate || 0) / 100
  const startFY = fyOf(item.start_date)
  if (!cost || !rate || endYear < startFY) {
    return { fyDeduction: 0, accumulated: 0, wdv: cost }
  }
  let wdv = cost
  let accumulated = 0
  let fyDeduction = 0
  for (let fy = startFY; fy <= endYear; fy++) {
    const { start, end } = fyRange(fy)
    const periodStart = fy === startFY ? item.start_date : start
    const yearFrac = Math.min(daysInclusive(periodStart, end) / 365, 1)
    let ded = item.method === 'diminishing' ? wdv * rate * yearFrac : cost * rate * yearFrac
    ded = Math.min(ded, wdv) // never depreciate below 0
    if (fy === endYear) fyDeduction = ded
    wdv -= ded
    accumulated += ded
  }
  return { fyDeduction, accumulated, wdv }
}

export function totalDepreciationForFY(items, endYear) {
  return (items || []).reduce((s, it) => s + depreciationForFY(it, endYear).fyDeduction, 0)
}
