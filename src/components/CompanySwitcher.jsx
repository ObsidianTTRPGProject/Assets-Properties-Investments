import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

// Super-admin only: pick which company's data you're viewing/acting in.
// It updates your own profile's company_id (which the data security keys off),
// so the choice persists across reloads and devices. Switch back to your
// primary company (Cool Kids) when you're done helping another business.
export default function CompanySwitcher() {
  const { isSuperAdmin, companyId } = useAuth()
  const [companies, setCompanies] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isSuperAdmin) return
    supabase.from('companies').select('id, name').order('name').then(({ data }) => setCompanies(data || []))
  }, [isSuperAdmin])

  if (!isSuperAdmin) return null

  async function switchTo(id) {
    if (!id || id === companyId) return
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ company_id: id }).eq('id', user.id)
    window.location.reload()
  }

  return (
    <select
      value={companyId || ''}
      disabled={busy}
      onChange={(e) => switchTo(e.target.value)}
      title="Viewing as company (super admin)"
      className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm font-medium text-amber-800"
    >
      {!companyId && <option value="">— pick company —</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>🏢 {c.name}</option>
      ))}
    </select>
  )
}
