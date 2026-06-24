import { parseBillFields } from './billParse'

// OCR an image of a bill (a phone photo, scan, or pasted screenshot) and parse
// the fields. Uses tesseract.js, lazy loaded; its worker + language data are
// fetched from a CDN on first use, so the first run takes a few seconds.
export async function extractBillFromImage(file, onProgress) {
  const Tesseract = await import('tesseract.js')
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m) => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress) },
  })
  const text = data.text || ''
  return { text, fields: parseBillFields(text) }
}
