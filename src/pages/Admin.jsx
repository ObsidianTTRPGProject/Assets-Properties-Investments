import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { adminCall } from '../lib/adminApi'
import { Card, Button, Field, Input, Select, Badge } from '../components/ui'

const ROLE_LABEL = { super_admin: 'Super admin', company_admin: 'Company admin', member: 'Member' }

export default function Admin() {
  const { isSuperAdmin, isCompanyAdmin, companyId } = useAuth()
  const [companies, setCompanies] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // add-user form
  const [form, setForm] = useState({ email: '', full_name: '', company_id: '', role: 'member', mode: 'invite', password: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // add-company form
  const [newCompany, setNewCompany] = useState('')

  useEffect(() => { if (isCompanyAdmin) load() }, [isCompanyAdmin])

  async function load() {
    setLoading(true); setErr('')
    try {
      if (isSuperAdmin) {
        const { companies } = await adminCall('list_companies')
        setCompanies(companies || [])
      }
      const { users } = await adminCall('list_users')
      setUsers(users || [])
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  const roleOptions = isSuperAdmin
    ? ['member', 'company_admin', 'super_admin']
    : ['member', 'company_admin']

  async function addUser() {
    setErr('')
    if (!form.email.trim()) { setErr('Email is required.'); return }
    const company_id = isSuperAdmin ? form.company_id : companyId
    if (isSuperAdmin && !company_id) { setErr('Pick a company for the new user.'); return }
    if (form.mode === 'password' && !form.password) { setErr('Enter a starting password, or switch to “Send invite”.'); return }
    setBusy(true)
    try {
      await adminCall('create_user', {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        company_id,
        role: form.role,
        password: form.mode === 'password' ? form.password : undefined,
      })
      setForm({ email: '', full_name: '', company_id: '', role: 'member', mode: 'invite', password: '' })
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function resetPassword(u) {
    const pw = prompt(`Set a new password for ${u.email}:`)
    if (!pw) return
    try { await adminCall('set_password', { user_id: u.id, password: pw }); alert('Password updated.') }
    catch (e) { alert('Failed: ' + e.message) }
  }
  async function changeRole(u, role) {
    try { await adminCall('set_role', { user_id: u.id, role }); load() }
    catch (e) { alert('Failed: ' + e.message) }
  }
  async function changeCompany(u, company_id) {
    try { await adminCall('set_company', { user_id: u.id, company_id }); load() }
    catch (e) { alert('Failed: ' + e.message) }
  }
  async function removeUser(u) {
    if (!confirm(`Delete ${u.email}? This removes their login and cannot be undone.`)) return
    try { await adminCall('delete_user', { user_id: u.id }); load() }
    catch (e) { alert('Failed: ' + e.message) }
  }
  async function addCompany() {
    if (!newCompany.trim()) return
    try { await adminCall('create_company', { name: newCompany.trim() }); setNewCompany(''); load() }
    catch (e) { alert('Failed: ' + e.message) }
  }

  if (!isCompanyAdmin) {
    return <Card className="p-8 text-center text-slate-500">You don’t have access to the admin area.</Card>
  }

  const companyName = (id) => companies.find((c) => c.id === id)?.name

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="text-sm text-slate-500">{isSuperAdmin ? 'Manage all companies and users.' : 'Manage your company’s users.'}</p>
      </div>

      {err && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</Card>}

      {/* Companies (super admin only) */}
      {isSuperAdmin && (
        <Card className="p-5">
          <h2 className="mb-3 font-medium">Companies</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {companies.map((c) => (
              <Badge key={c.id} color="slate">{c.name}</Badge>
            ))}
            {companies.length === 0 && <span className="text-sm text-slate-400">No companies yet.</span>}
          </div>
          <div className="flex gap-2">
            <Input placeholder="New company name" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
            <Button onClick={addCompany}>Add company</Button>
          </div>
        </Card>
      )}

      {/* Add user */}
      <Card className="p-5">
        <h2 className="mb-3 font-medium">Add a user</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email *"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Full name"><Input value={form.full_name} onChange={set('full_name')} /></Field>
          {isSuperAdmin && (
            <Field label="Company *">
              <Select value={form.company_id} onChange={set('company_id')}>
                <option value="">— pick a company —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Role">
            <Select value={form.role} onChange={set('role')}>
              {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="How to add">
            <Select value={form.mode} onChange={set('mode')}>
              <option value="invite">Send email invite</option>
              <option value="password">Set a starting password</option>
            </Select>
          </Field>
          {form.mode === 'password' && (
            <Field label="Starting password"><Input type="text" value={form.password} onChange={set('password')} /></Field>
          )}
        </div>
        <div className="mt-3">
          <Button onClick={addUser} disabled={busy}>{busy ? 'Adding…' : 'Add user'}</Button>
        </div>
      </Card>

      {/* Users */}
      <Card className="p-5">
        <h2 className="mb-3 font-medium">Users</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-400">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">User</th>
                  {isSuperAdmin && <th className="py-2 pr-3">Company</th>}
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-700">{u.full_name || '—'}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    {isSuperAdmin && (
                      <td className="py-2 pr-3">
                        <Select value={u.company_id || ''} onChange={(e) => changeCompany(u, e.target.value)}>
                          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      <Select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                        {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-3 text-xs">
                        <button onClick={() => resetPassword(u)} className="text-brand-600 hover:underline">Reset password</button>
                        <button onClick={() => removeUser(u)} className="text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
