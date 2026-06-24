import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Card, Button, Field, Input, Select, Textarea } from '../ui'
import { money, dateStr } from '../../lib/format'
import { uploadFile, signedUrl } from '../../lib/storage'
import AddressAutocomplete from '../AddressAutocomplete'
import PropertyMap from '../PropertyMap'
import ActivityPanels from '../ActivityPanels'

export default function OverviewTab({ property, onChange }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(property)
  const [busy, setBusy] = useState(false)
  const [coverUrl, setCoverUrl] = useState(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  useEffect(() => {
    let active = true
    if (property.cover_photo_path) {
      signedUrl('property-photos', property.cover_photo_path).then((u) => active && setCoverUrl(u))
    } else {
      setCoverUrl(null)
    }
    return () => { active = false }
  }, [property.cover_photo_path])

  async function uploadCover(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const path = await uploadFile('property-photos', property.id, file)
      await supabase.from('properties').update({ cover_photo_path: path }).eq('id', property.id)
      onChange()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
    setUploadingCover(false)
    e.target.value = ''
  }

  async function save() {
    setBusy(true)
    const num = (v) => (v === '' || v == null ? null : Number(v))
    const { id, created_at, openTasks, weeklyRent, ...rest } = form
    await supabase
      .from('properties')
      .update({
        ...rest,
        purchase_price: num(rest.purchase_price),
        current_value: num(rest.current_value),
        bedrooms: num(rest.bedrooms),
        bathrooms: num(rest.bathrooms),
        car_spaces: num(rest.car_spaces),
        build_progress: num(rest.build_progress),
        loan_balance: num(rest.loan_balance),
        loan_rate: num(rest.loan_rate),
        loan_repayment: num(rest.loan_repayment),
        latitude: num(rest.latitude),
        longitude: num(rest.longitude),
        purchase_date: rest.purchase_date || null,
      })
      .eq('id', id)
    setBusy(false)
    setEditing(false)
    onChange()
  }

  if (editing) {
    return (
      <Card className="max-w-2xl space-y-4 p-6">
        <Field label="Nickname"><Input value={form.nickname || ''} onChange={set('nickname')} /></Field>
        <Field label="Address">
          <AddressAutocomplete
            value={form.formatted_address || form.address || ''}
            onSelect={(r) =>
              setForm((f) => ({
                ...f,
                address: r.formatted_address,
                formatted_address: r.formatted_address,
                street: r.street,
                suburb: r.suburb,
                state: r.state,
                postcode: r.postcode,
                country: r.country,
                latitude: r.latitude,
                longitude: r.longitude,
                osm_place_id: r.osm_place_id,
              }))
            }
          />
        </Field>
        {form.suburb && (
          <p className="-mt-2 text-xs text-slate-500">📍 {[form.suburb, form.state, form.postcode].filter(Boolean).join(', ')}</p>
        )}
        <Field label="Status">
          <Select value={form.status || ''} onChange={set('status')}>
            <option value="acquisition">Acquisition</option>
            <option value="construction">Under construction</option>
            <option value="available">Available</option>
            <option value="tenanted">Tenanted</option>
            <option value="sold">Sold</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase price"><Input type="number" value={form.purchase_price || ''} onChange={set('purchase_price')} /></Field>
          <Field label="Current value"><Input type="number" value={form.current_value || ''} onChange={set('current_value')} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Beds"><Input type="number" value={form.bedrooms || ''} onChange={set('bedrooms')} /></Field>
          <Field label="Baths"><Input type="number" value={form.bathrooms || ''} onChange={set('bathrooms')} /></Field>
          <Field label="Car"><Input type="number" value={form.car_spaces || ''} onChange={set('car_spaces')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Build stage"><Input value={form.build_stage || ''} onChange={set('build_stage')} /></Field>
          <Field label="Build progress %"><Input type="number" value={form.build_progress || ''} onChange={set('build_progress')} /></Field>
        </div>
        <Field label="Notes"><Textarea value={form.notes || ''} onChange={set('notes')} /></Field>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          <Button variant="secondary" onClick={() => { setForm(property); setEditing(false) }}>Cancel</Button>
        </div>
      </Card>
    )
  }

  const rows = [
    ['Location', [property.suburb, property.state, property.postcode].filter(Boolean).join(', ')],
    ['Type', property.property_type],
    ['Purchase date', property.purchase_date && dateStr(property.purchase_date)],
    ['Purchase price', property.purchase_price && money(property.purchase_price)],
    ['Current value', property.current_value && money(property.current_value)],
    ['Bed / Bath / Car', `🛏️ ${property.bedrooms || 0}   🛁 ${property.bathrooms || 0}   🚗 ${property.car_spaces || 0}`],
    ['Land size', property.land_size],
    ['Build stage', property.build_stage && `${property.build_stage} (${property.build_progress || 0}%)`],
    ['Loan', property.loan_lender && `${property.loan_lender} · ${money(property.loan_balance)} @ ${property.loan_rate || '—'}%`],
  ].filter(([, v]) => v)

  const hasCoords = Number.isFinite(Number(property.latitude)) && Number.isFinite(Number(property.longitude)) && property.latitude

  return (
    <div className="space-y-5">
    <Card className="overflow-hidden p-0">
      {coverUrl ? (
        <div className="relative">
          <img src={coverUrl} alt={property.nickname} className="h-48 w-full object-cover" />
          <label className="absolute bottom-2 right-2 cursor-pointer rounded-lg bg-white/90 px-3 py-1 text-xs font-medium shadow hover:bg-white">
            {uploadingCover ? 'Uploading…' : 'Change cover'}
            <input type="file" accept="image/*" className="hidden" onChange={uploadCover} disabled={uploadingCover} />
          </label>
        </div>
      ) : (
        <label className="flex h-28 cursor-pointer items-center justify-center bg-slate-50 text-sm text-slate-500 hover:bg-slate-100">
          {uploadingCover ? 'Uploading…' : '+ Add a cover photo for this property'}
          <input type="file" accept="image/*" className="hidden" onChange={uploadCover} disabled={uploadingCover} />
        </label>
      )}
    </Card>

    <div className="grid gap-5 lg:grid-cols-2">
    <Card className="p-6">
      <div className="mb-4 flex justify-between">
        <h2 className="font-medium">Details</h2>
        <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
      </div>
      <div className="space-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{k}</span>
            <span className="font-medium text-slate-700">{v}</span>
          </div>
        ))}
      </div>
      {property.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{property.notes}</p>}
    </Card>

    <Card className="overflow-hidden p-0">
      {hasCoords ? (
        <PropertyMap
          markers={[{ lat: Number(property.latitude), lng: Number(property.longitude), label: property.nickname }]}
          height={360}
        />
      ) : (
        <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-sm text-slate-400">
          No map location yet. Click <span className="mx-1 font-medium">Edit</span> and pick the address to pin it on the map.
        </div>
      )}
    </Card>
    </div>

    <div>
      <h2 className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-400">This property — activity</h2>
      <ActivityPanels propertyId={property.id} compact />
    </div>
    </div>
  )
}
