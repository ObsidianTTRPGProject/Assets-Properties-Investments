// Shared heuristic parser for bill text (used by both PDF text and image OCR).
// Tuned for common Australian billers (councils, SA Water, RevenueSA/ESL),
// but deliberately forgiving — the user reviews before saving.

export function parseBillFields(raw) {
  const text = (raw || '').replace(/\s+/g, ' ')
  const lower = text.toLowerCase()
  return {
    amount: findAmount(text, lower),
    due_date: findDate(text, lower, ['due date', 'pay by date', 'last day for payment', 'pay by', 'payment due', 'pay now', 'due']),
    issue_date: findDate(text, lower, ['issue date', 'date of issue', 'invoice date', 'date of notice', 'bill date', 'tax invoice']),
    reference: findReference(text, lower),
    invoice_number: findInvoice(text, lower),
    category: guessCategory(lower),
    description: guessDescription(lower),
  }
}

const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''))
const pad = (s) => String(s).padStart(2, '0')
const AMT = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/

function findAmount(text, lower) {
  // Ordered by how reliably the keyword sits next to the payable amount.
  const keys = ['total amount due', 'amount due', 'total amount payable', 'amount payable', 'full payment amount', 'quarterly amount', 'total due', 'balance due', 'please pay', 'total payable']
  for (const k of keys) {
    let idx = lower.indexOf(k)
    while (idx !== -1) {
      const m = text.slice(idx, idx + 60).match(AMT)
      if (m) return num(m[1])
      idx = lower.indexOf(k, idx + 1)
    }
  }
  // Fallback: the LAST dollar figure on the page (usually the payment-slip total),
  // which avoids grabbing a large line-item charge from a rates notice.
  let last = null
  const re = new RegExp(AMT.source, 'g')
  let m
  while ((m = re.exec(text))) last = num(m[1])
  return last
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

function parseDate(s) {
  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/) // dd/mm/yyyy (AU day-first)
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${pad(mo)}-${pad(d)}` }
  m = s.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\,?\s*(\d{2,4})/i) // dd Mon yy(yy)
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}` }
  return ''
}

function findDate(text, lower, keys) {
  for (const k of keys) {
    let idx = lower.indexOf(k)
    while (idx !== -1) {
      const iso = parseDate(text.slice(idx, idx + 60))
      if (iso) return iso
      idx = lower.indexOf(k, idx + 1)
    }
  }
  return ''
}

function findReference(text, lower) {
  const keys = ['customer reference no', 'customer ref no', 'customer reference', 'reference number', 'reference no', 'account number', 'account no', 'assessment number', 'ownership number', 'valuation number', 'crn', 'reference', 'ref']
  for (const k of keys) {
    const idx = lower.indexOf(k)
    if (idx !== -1) {
      const m = text.slice(idx + k.length, idx + k.length + 40).match(/[:#.\s]*([A-Za-z0-9][A-Za-z0-9\-\/ ]{3,}?)(?:\s{2,}|$|\n|[a-z]{4,})/)
      if (m) return m[1].trim().replace(/\s+/g, ' ')
    }
  }
  return ''
}

function findInvoice(text, lower) {
  const keys = ['invoice number', 'invoice no', 'tax invoice number', 'invoice #']
  for (const k of keys) {
    const idx = lower.indexOf(k)
    if (idx !== -1) {
      const m = text.slice(idx + k.length, idx + k.length + 30).match(/[:#.\s]*([A-Za-z0-9][A-Za-z0-9\-\/]{3,})/)
      if (m) return m[1].trim()
    }
  }
  return ''
}

function guessCategory(lower) {
  if (/(water|sewer|drainage)/.test(lower)) return 'utilities'
  if (/(electric|energy|kwh|gas|power)/.test(lower)) return 'utilities'
  if (/(rate notice|council|shire|rates|valuation|emergency services|levy|esl|revenuesa)/.test(lower)) return 'rates'
  if (/(insur|premium|policy)/.test(lower)) return 'insurance'
  if (/(strata|body corporate)/.test(lower)) return 'management'
  if (/(interest|loan|mortgage)/.test(lower)) return 'interest'
  return 'other'
}

function guessDescription(lower) {
  if (/sa water|water/.test(lower)) return 'Water account'
  if (/(electric|energy|power)/.test(lower)) return 'Electricity account'
  if (/gas/.test(lower)) return 'Gas account'
  if (/emergency services|esl/.test(lower)) return 'Emergency Services Levy'
  if (/(rate notice|council|rates)/.test(lower)) return 'Council rates'
  if (/(insur|policy)/.test(lower)) return 'Insurance'
  if (/(strata|body corporate)/.test(lower)) return 'Strata / body corporate'
  return 'Imported bill'
}
