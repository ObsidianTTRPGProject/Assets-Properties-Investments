// Generic PDF bill extraction. Runs entirely in the browser (pdf.js, lazy
// loaded). Pulls plain text, then makes a best-effort guess at the key fields.
// It's deliberately forgiving — the user reviews/edits before saving, and we
// can add per-biller patterns later for higher accuracy.

export async function extractBillFromPDF(file) {
  const pdfjsLib = await import('pdfjs-dist')
  // Worker served from a version-matched CDN copy (avoids bundler worker setup).
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it) => it.str).join(' ') + '\n'
  }
  return { text, fields: parseFields(text) }
}

function parseFields(raw) {
  const text = raw.replace(/ /g, ' ').replace(/\s+/g, ' ')
  const lower = text.toLowerCase()
  return {
    amount: findAmount(text, lower),
    due_date: findDate(text, lower, ['due date', 'payment due', 'pay by', 'due']),
    issue_date: findDate(text, lower, ['issue date', 'invoice date', 'bill date', 'date of issue', 'tax invoice']),
    reference: findReference(text, lower),
    category: guessCategory(lower),
    description: guessDescription(lower),
  }
}

const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''))
const pad = (s) => String(s).padStart(2, '0')
const AMT = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/

function findAmount(text, lower) {
  const keys = ['total amount due', 'total amount payable', 'amount due', 'total due', 'balance due', 'please pay', 'total payable', 'new charges', 'total']
  for (const k of keys) {
    let idx = lower.indexOf(k)
    while (idx !== -1) {
      const m = text.slice(idx, idx + 60).match(AMT)
      if (m) return num(m[1])
      idx = lower.indexOf(k, idx + 1)
    }
  }
  // Fallback: the largest dollar figure on the page.
  let max = null
  const re = new RegExp(AMT.source, 'g')
  let m
  while ((m = re.exec(text))) {
    const v = num(m[1])
    if (max == null || v > max) max = v
  }
  return max
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

function parseDate(s) {
  // dd/mm/yyyy (Australian day-first)
  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = '20' + y
    return `${y}-${pad(mo)}-${pad(d)}`
  }
  // dd Mon yyyy
  m = s.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\,?\s*(\d{4})/i)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()]
    return `${m[3]}-${pad(mo)}-${pad(m[1])}`
  }
  return ''
}

function findDate(text, lower, keys) {
  for (const k of keys) {
    const idx = lower.indexOf(k)
    if (idx !== -1) {
      const iso = parseDate(text.slice(idx, idx + 60))
      if (iso) return iso
    }
  }
  return ''
}

function findReference(text, lower) {
  const keys = ['reference number', 'reference no', 'payment reference', 'customer reference', 'account number', 'account no', 'invoice number', 'invoice no', 'bpay ref', 'crn', 'reference']
  for (const k of keys) {
    const idx = lower.indexOf(k)
    if (idx !== -1) {
      const m = text.slice(idx + k.length, idx + k.length + 40).match(/[:#\s]*([A-Za-z0-9][A-Za-z0-9\-\/ ]{3,}?)(?:\s{2,}|$|\n)/)
      if (m) return m[1].trim()
    }
  }
  return ''
}

function guessCategory(lower) {
  if (/(water|sewer|drainage)/.test(lower)) return 'utilities'
  if (/(electric|energy|kwh|gas|power)/.test(lower)) return 'utilities'
  if (/(council|shire|rates|valuation)/.test(lower)) return 'rates'
  if (/(insur|premium|policy)/.test(lower)) return 'insurance'
  if (/(strata|body corporate|levy)/.test(lower)) return 'management'
  if (/(interest|loan|mortgage)/.test(lower)) return 'interest'
  return 'other'
}

function guessDescription(lower) {
  if (/(water|sewer)/.test(lower)) return 'Water account'
  if (/(electric|energy|power)/.test(lower)) return 'Electricity account'
  if (/gas/.test(lower)) return 'Gas account'
  if (/(council|rates|shire)/.test(lower)) return 'Council rates'
  if (/(insur|policy)/.test(lower)) return 'Insurance'
  if (/(strata|body corporate|levy)/.test(lower)) return 'Strata / body corporate'
  return 'Imported bill'
}
