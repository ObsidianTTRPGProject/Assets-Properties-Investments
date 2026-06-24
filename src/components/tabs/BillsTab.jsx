import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadFile, signedUrl, deleteFile } from '../../lib/storage'
import { extractBillFromPDF } from '../../lib/pdfImport'
import { Card, Button, Field, Input, Select } from '../ui'
import { money, dateStr } from '../../lib/format'

const STATUSES = ['unpaid', 'paid', 'overdue', 'disputed']
const CATEGORIES = ['rates', 'insurance', 'utilities', 'build', 'repairs', 'management', 'interest', 'other']
const BUCKET = 'property-docs'

export default function BillsTab({ propertyId }) {
  const [bills, setBills] = useState([])
  const [contacts, setContacts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(blank())
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  function blank() {
    return { description: '', reference: '', category: 'rates', amount: '', issue_date: '', due_date: '', status: 'unpaid', contact_id: '' }
  }

  useEffect(() => { load() }, [propertyId])

  async function load() {
    const { data } = await supabase.from('bills').select('*').eq('property_id', propertyId).order('due_date', { ascending: false })
    setBills(data || [])
    const { data: c } = await supabase.from('contacts').select('id, name').order('name')
    setContacts(c || [])
  }

  function startAdd() { setForm(blank()); setFile(null); setEditingId(null); setImportNote(''); setShowForm(true) }
  function startEdit(b) {
    setForm({
      description: b.description || '', reference: b.reference || '', category: b.category || 'other', amount: b.amount ?? '',
      issue_date: b.issue_date || '', due_date: b.due_date || '', status: b.status || 'unpaid', contact_id: b.contact_id || '',
    })
    setFile(null); setEditingId(b.id); setImportNote(''); setShowForm(true)
  }

  async function importPDF(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setImporting(true); setImportNote('')
    try {
      const { fields } = await extractBillFromPDF(f)
      setForm((cur) => ({
        ...cur,
        description: fields.description || cur.description,
        amount: fields.amount != null ? String(fields.amount) : cur.amount,
        reference: fields.reference || cur.reference,
        due_date: fields.due_date || cur.due_date,
        issue_date: fields.issue_date || cur.issue_date,
        category: fields.category || cur.category,
      }))
      setFile(f) // keep the original PDF as the attachment
      setImportNote('Imported from PDF — please check the fields, then Save.')
    } catch (err) {
      setImportNote('Could not read that PDF: ' + err.message)
    }
    setImporting(false)
    e.target.value = ''
  }

  async function save() {
    if (!form.description.trim() || form.amount === '') return
    setBusy(true)
    try {
      let document_path
      if (file) document_path = await uploadFile(BUCKET, propertyId, file)
      const base = {
        ...form, property_id: propertyId, amount: Number(form.amount), contact_id: form.contact_id || null,
        issue_date: form.issue_date || null, due_date: form.due_date || null,
        paid_date: form.status === 'paid' ? new Date().toISOString().slice(0, 10) : null,
      }
      if (editingId) {
        if (document_path) base.document_path = document_path
        await supabase.from('bills').update(base).eq('id', editingId)
      } else {
        await supabase.from('bills').insert({ ...base, document_path: document_path || null })
      }
      setForm(blank()); setFile(null); setEditingId(null); setShowForm(false); await load()
    } catch (err) { alert('Failed: ' + err.message) }
    setBusy(false)
  }

  async function setStatus(bill, status) {
    await supabase.from('bills').update({ status, paid_date: status === 'paid' ? new Date().toISOString().slice(0, 10) : null }).eq('id', bill.id)
    load()
  }

  async function del(bill) {
    if (!confirm(`Delete bill "${bill.description}" (${money(bill.amount)})? This cannot be undone.`)) return
    if (bill.document_path) await deleteFile(BUCKET, bill.document_path)
    await supabase.from('bills').delete().eq('id', bill.id); load()
  }

  async function viewDoc(bill) {
    const url = await signedUrl(BUCKET, bill.document_path)
    if (url) window.open(url, '_blank')
  }

  const total = bills.reduce((s, b) => s + Number(b.amount || 0), 0)
  const unpaid = bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + Number(b.amount || 0), 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-medium">Bills &amp; Expenses</h2>
          <p className="text-sm text-slate-500">Total {money(total)} · Outstanding {money(unpaid)}</p>
        </div>
        <Button onClick={() => (showForm ? setShowForm(false) : startAdd())}>{showForm ? 'Close' : '+ New bill'}</Button>
      </div>

      {showForm && (
        <Card className="mb-5 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{editingId ? 'Edit bill' : 'New bill'}</h3>
            <label className="cursor-pointer rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100">
              {importing ? 'Reading PDF…' : '⬆ Import from PDF'}
              <input type="file" accept="application/pdf" className="hidden" onChange={importPDF} disabled={importing} />
            </label>
          </div>
          {importNote && <p className="text-xs text-brand-700">{importNote}</p>}
          <Field label="Description *"><Input value={form.description} onChange={set('description')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reference / account no."><Input value={form.reference} onChange={set('reference')} /></Field>
            <Field label="Amount (AUD) *"><Input type="number" value={form.amount} onChange={set('amount')} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><Select value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Status"><Select value={form.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date"><Input type="date" value={form.issue_date} onChange={set('issue_date')} /></Field>
            <Field label="Due date"><Input type="date" value={form.due_date} onChange={set('due_date')} /></Field>
          </div>
          <Field label="Vendor"><Select value={form.contact_id} onChange={set('contact_id')}><option value="">— none —</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label={editingId ? 'Replace invoice document (optional)' : 'Invoice document (optional)'}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
            {file && <p className="mt-1 text-xs text-slate-400">Attached: {file.name}</p>}
          </Field>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add bill'}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</Button>
          </div>
        </Card>
      )}

      {bills.length === 0 ? (
        <p className="text-slate-400">No bills yet.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium">{b.description}</div>
                    {b.reference && <div className="text-xs text-slate-400">Ref: {b.reference}</div>}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{b.category}</td>
                  <td className="px-4 py-2 text-slate-500">{dateStr(b.due_date)}</td>
                  <td className="px-4 py-2 text-right font-medium">{money(b.amount)}</td>
                  <td className="px-4 py-2"><Select value={b.status} onChange={(e) => setStatus(b, e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2 text-xs">
                      {b.document_path && <button onClick={() => viewDoc(b)} className="text-brand-600 hover:underline">Doc</button>}
                      <button onClick={() => startEdit(b)} className="text-brand-600 hover:underline">Edit</button>
                      <button onClick={() => del(b)} className="text-red-500 hover:underline">Delete</button>
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
