import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadFile } from '../../lib/storage'
import { Card, Button, Field, Input, Select, Textarea, Badge } from '../ui'
import { dateStr } from '../../lib/format'
import { notifyEmail } from '../../lib/notifyEmail'

const STATUSES = ['open', 'in progress', 'blocked', 'resolved', 'closed']
const TYPES = ['build issue', 'maintenance', 'inspection', 'other']
const PRIORITIES = ['low', 'medium', 'high']

export default function TasksTab({ propertyId }) {
  const [tasks, setTasks] = useState([])
  const [contacts, setContacts] = useState([])
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(blank())
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  function blank() {
    return { title: '', description: '', task_type: 'maintenance', priority: 'medium', contact_id: '', assigned_user_id: '', due_date: '' }
  }

  useEffect(() => { load() }, [propertyId])

  async function load() {
    const { data } = await supabase.from('tasks').select('*').eq('property_id', propertyId).order('created_at', { ascending: false })
    setTasks(data || [])
    const { data: c } = await supabase.from('contacts').select('id, name, role').order('name')
    setContacts(c || [])
    const { data: u } = await supabase.from('profiles').select('id, email, full_name').order('email')
    setUsers(u || [])
  }

  function startAdd() { setForm(blank()); setEditingId(null); setShowForm(true) }
  function startEdit(t) {
    setForm({
      title: t.title || '', description: t.description || '', task_type: t.task_type || 'maintenance',
      priority: t.priority || 'medium', contact_id: t.contact_id || '', assigned_user_id: t.assigned_user_id || '',
      due_date: t.due_date || '',
    })
    setEditingId(t.id); setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      ...form, property_id: propertyId,
      contact_id: form.contact_id || null, assigned_user_id: form.assigned_user_id || null,
      due_date: form.due_date || null,
    }
    if (editingId) await supabase.from('tasks').update(payload).eq('id', editingId)
    else await supabase.from('tasks').insert(payload)
    if (form.assigned_user_id) {
      const u = users.find((x) => x.id === form.assigned_user_id)
      if (u?.email) notifyEmail({ kind: 'task_assigned', title: form.title, toEmail: u.email, propertyId })
    }
    setForm(blank()); setEditingId(null); setShowForm(false); load()
  }

  async function setStatus(task, status) {
    await supabase.from('tasks').update({
      status, resolved_on: status === 'resolved' || status === 'closed' ? new Date().toISOString().slice(0, 10) : null,
    }).eq('id', task.id)
    load()
  }

  async function del(task) {
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return
    await supabase.from('tasks').delete().eq('id', task.id); load()
  }

  async function attachPhoto(task, e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const path = await uploadFile('property-photos', propertyId, file)
      await supabase.from('photos').insert({ property_id: propertyId, task_id: task.id, storage_path: path, category: 'issue', caption: task.title })
      alert('Photo attached (view it in the Photos tab).')
    } catch (err) { alert('Upload failed: ' + err.message) }
    e.target.value = ''
  }

  const contactName = (id) => contacts.find((c) => c.id === id)?.name
  const userName = (id) => { const u = users.find((x) => x.id === id); return u ? (u.full_name || u.email) : null }

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="font-medium">Tasks &amp; Incidents</h2>
        <Button onClick={() => (showForm ? setShowForm(false) : startAdd())}>{showForm ? 'Close' : '+ New task'}</Button>
      </div>

      {showForm && (
        <Card className="mb-5 space-y-3 p-4">
          <h3 className="text-sm font-medium">{editingId ? 'Edit task' : 'New task'}</h3>
          <Field label="Title *"><Input value={form.title} onChange={set('title')} /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={set('description')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={form.task_type} onChange={set('task_type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Priority"><Select value={form.priority} onChange={set('priority')}>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to team member">
              <Select value={form.assigned_user_id} onChange={set('assigned_user_id')}>
                <option value="">— none —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </Select>
            </Field>
            <Field label="Contractor / contact">
              <Select value={form.contact_id} onChange={set('contact_id')}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={set('due_date')} /></Field>
          <div className="flex gap-2">
            <Button onClick={save}>{editingId ? 'Save changes' : 'Add task'}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</Button>
          </div>
        </Card>
      )}

      {tasks.length === 0 ? (
        <p className="text-slate-400">No tasks yet.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{t.title}</h3>
                    <Badge color={t.priority === 'high' ? 'red' : t.priority === 'low' ? 'slate' : 'amber'}>{t.priority}</Badge>
                    <Badge color="slate">{t.task_type}</Badge>
                  </div>
                  {t.description && <p className="mt-1 text-sm text-slate-600">{t.description}</p>}
                  <p className="mt-2 text-xs text-slate-400">
                    {userName(t.assigned_user_id) && `Assigned: ${userName(t.assigned_user_id)} · `}
                    {contactName(t.contact_id) && `Contact: ${contactName(t.contact_id)} · `}
                    {t.due_date && `Due ${dateStr(t.due_date)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Select value={t.status} onChange={(e) => setStatus(t, e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => startEdit(t)} className="text-brand-600 hover:underline">Edit</button>
                    <label className="cursor-pointer text-brand-600 hover:underline">+ Photo<input type="file" accept="image/*" className="hidden" onChange={(e) => attachPhoto(t, e)} /></label>
                    <button onClick={() => del(t)} className="text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
