import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Field, Input, Textarea, Badge } from '../ui'
import { dateStr } from '../../lib/format'

const CHOICES = ['yes', 'no', 'abstain']

export default function VotingTab({ propertyId }) {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [votes, setVotes] = useState([])
  const [ballots, setBallots] = useState({}) // voteId -> [ballots]
  const [myName, setMyName] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', description: '' })

  useEffect(() => { load() }, [propertyId, userId])

  async function load() {
    const { data: v } = await supabase.from('votes').select('*').eq('property_id', propertyId).order('created_at', { ascending: false })
    setVotes(v || [])
    const ids = (v || []).map((x) => x.id)
    if (ids.length) {
      const { data: b } = await supabase.from('vote_ballots').select('*').in('vote_id', ids)
      const m = {}
      ;(b || []).forEach((x) => { (m[x.vote_id] = m[x.vote_id] || []).push(x) })
      setBallots(m)
    } else setBallots({})
    if (userId) {
      const { data: prof } = await supabase.from('profiles').select('full_name, email').eq('id', userId).single()
      setMyName(prof ? (prof.full_name || prof.email) : (session?.user?.email || 'Me'))
    }
  }

  async function addVote() {
    if (!form.title.trim()) return
    const { error } = await supabase.from('votes').insert({ property_id: propertyId, title: form.title, description: form.description, created_by: userId || null })
    if (error) {
      const missing = /votes/i.test(error.message) && /(does not exist|schema cache|find the table)/i.test(error.message)
      alert('Could not raise vote: ' + error.message + (missing ? '\n\nThe voting tables aren\'t set up yet — run supabase/migration-11-voting.sql in the Supabase SQL Editor.' : ''))
      return
    }
    setForm({ title: '', description: '' }); setAdding(false); load()
  }

  async function delVote(v) {
    if (!confirm(`Delete vote "${v.title}" and all ballots?`)) return
    await supabase.from('votes').delete().eq('id', v.id); load()
  }

  async function castBallot(vote, choice) {
    if (!userId) return
    const { error } = await supabase.from('vote_ballots').upsert(
      { vote_id: vote.id, member_id: userId, member_name: myName, choice },
      { onConflict: 'vote_id,member_id' }
    )
    if (error) { alert('Could not record your vote: ' + error.message); return }
    load()
  }

  function tally(voteId) {
    const list = ballots[voteId] || []
    const t = { yes: 0, no: 0, abstain: 0 }
    list.forEach((b) => { t[b.choice] = (t[b.choice] || 0) + 1 })
    return t
  }
  function outcome(t) {
    if (t.yes > t.no) return 'Passed'
    if (t.no > t.yes) return 'Failed'
    return 'Tied'
  }

  async function closeVote(vote) {
    const t = tally(vote.id)
    const result = outcome(t)
    if (!confirm(`Close this vote and record the result as "${result}" (Yes ${t.yes} / No ${t.no} / Abstain ${t.abstain})?`)) return
    await supabase.from('votes').update({ status: 'closed', result }).eq('id', vote.id); load()
  }

  async function reopenVote(vote) {
    await supabase.from('votes').update({ status: 'open', result: null }).eq('id', vote.id); load()
  }

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="font-medium">Voting &amp; decisions</h2>
          <p className="text-sm text-slate-500">Raise a motion, each member casts a vote, the result is recorded against this property.</p>
        </div>
        <Button onClick={() => setAdding(!adding)}>{adding ? 'Close' : '+ New vote'}</Button>
      </div>

      {adding && (
        <Card className="mb-5 space-y-3 p-4">
          <Field label="Title *"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Replace the roof for $14,000" /></Field>
          <Field label="Details"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Button onClick={addVote}>Raise vote</Button>
        </Card>
      )}

      {votes.length === 0 ? (
        <p className="text-slate-400">No votes yet.</p>
      ) : (
        <div className="space-y-4">
          {votes.map((v) => {
            const t = tally(v.id)
            const list = ballots[v.id] || []
            const myBallot = list.find((b) => b.member_id === userId)
            const open = v.status !== 'closed'
            const live = outcome(t)
            return (
              <Card key={v.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{v.title}</h3>
                      {open ? <Badge color="amber">open</Badge> : <Badge color={v.result === 'Passed' ? 'green' : v.result === 'Failed' ? 'red' : 'slate'}>{v.result}</Badge>}
                    </div>
                    {v.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{v.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">Raised {dateStr(v.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <div className="font-medium text-slate-700">Yes {t.yes} · No {t.no} · Abstain {t.abstain}</div>
                    {open && <div className="text-xs text-slate-400">currently: {live}</div>}
                  </div>
                </div>

                {open && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500">Your vote:</span>
                    {CHOICES.map((c) => (
                      <button key={c} onClick={() => castBallot(v, c)}
                        className={`rounded-lg px-3 py-1 text-sm capitalize ${myBallot?.choice === c ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                        {c}
                      </button>
                    ))}
                    {myBallot && <span className="text-xs text-slate-400">recorded as {myBallot.choice}</span>}
                  </div>
                )}

                {list.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {list.map((b) => (
                      <span key={b.id} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs">
                        {b.member_name || 'Member'}: <span className={b.choice === 'yes' ? 'text-green-600' : b.choice === 'no' ? 'text-red-600' : 'text-slate-500'}>{b.choice}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex gap-3 text-xs">
                  {open ? (
                    <button onClick={() => closeVote(v)} className="text-brand-600 hover:underline">Close &amp; record result</button>
                  ) : (
                    <button onClick={() => reopenVote(v)} className="text-brand-600 hover:underline">Reopen</button>
                  )}
                  <button onClick={() => delVote(v)} className="text-red-500 hover:underline">Delete</button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
