import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Badge, statusColor } from '../components/ui'
import { money, dateStr } from '../lib/format'
import OverviewTab from '../components/tabs/OverviewTab'
import PhotosTab from '../components/tabs/PhotosTab'
import TasksTab from '../components/tabs/TasksTab'
import BillsTab from '../components/tabs/BillsTab'
import TenantsTab from '../components/tabs/TenantsTab'
import RequestsTab from '../components/tabs/RequestsTab'
import FinancesTab from '../components/tabs/FinancesTab'
import DepreciationTab from '../components/tabs/DepreciationTab'
import VotingTab from '../components/tabs/VotingTab'

const TABS = ['Overview', 'Photos', 'Tasks', 'Bills', 'Tenants', 'Requests', 'Finances', 'Depreciation', 'Voting']

export default function PropertyDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.includes(requested) ? requested : 'Overview'
  const setTab = (t) => setSearchParams(t === 'Overview' ? {} : { tab: t })
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('properties').select('*').eq('id', id).single()
    setProperty(data)
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400">Loading…</p>
  if (!property) return <p className="text-slate-500">Property not found. <Link className="text-brand-600" to="/properties">Back</Link></p>

  return (
    <div>
      <Link to="/properties" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-700">← All properties</Link>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{property.nickname}</h1>
          <p className="text-sm text-slate-500">{property.address}</p>
        </div>
        <Badge color={statusColor(property.status)}>{property.status}</Badge>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab property={property} onChange={load} />}
      {tab === 'Photos' && <PhotosTab propertyId={id} />}
      {tab === 'Tasks' && <TasksTab propertyId={id} />}
      {tab === 'Bills' && <BillsTab propertyId={id} />}
      {tab === 'Tenants' && <TenantsTab propertyId={id} />}
      {tab === 'Requests' && <RequestsTab propertyId={id} />}
      {tab === 'Finances' && <FinancesTab propertyId={id} />}
      {tab === 'Depreciation' && <DepreciationTab propertyId={id} />}
      {tab === 'Voting' && <VotingTab propertyId={id} />}
    </div>
  )
}

export { money, dateStr }
