'use client'

import React, { useEffect, useMemo, useState } from 'react'

/* ========= Types ========= */
type Rep = {
  openstates_person_id: string
  name: string
  party?: string
  district?: string
  email?: string | null
  phone?: string | null
  links?: Array<{ url: string; note?: string }>
}
type RawRep = Partial<Rep> & { id?: string }
type LookupResponse = { address?: string; geographies?: any; stateRepresentatives: RawRep[] }
type VotesByPerson = Record<string, Record<string, string | null | undefined>>
type Decision = 'FOR' | 'AGAINST' | "DIDN'T VOTE"

/* ========= Config: optional issue chips (leave empty to use Bill chips) ========= */
const ISSUE_MAP: {
  key: string; label: string; columns: string[]; proVote?: Record<string,'Y'|'N'>
}[] = [
  // Example:
  // { key: 'schools', label: 'Public School Funding', columns: ['HB210_2025','HB583_2025'] },
  // { key: 'repro',   label: 'Reproductive Freedom', columns: ['HB1_2025'], proVote: { HB1_2025: 'N' } },
]

/* ========= Constants ========= */
const DEFAULT_ADDRESS = '25 Capitol St, Concord, NH 03301'
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://nh-rep-finder-api-staging.onrender.com' // staging fallback

/* ========= Vote normalization ========= */
const FOR_VALUES = new Set(['y','yes','aye','yea','for','support','supported','in favor','in favour'])
const AGAINST_VALUES = new Set(['n','no','nay','against','oppose','opposed'])
const ABSENT_PAT = /(did\s*not\s*vote|didn.?t\s*vote|not\s*vot|no\s*vote|nv|excused|absent|present|abstain)/i

function normalizeVoteCell(raw: unknown): Decision | null {
  if (raw == null) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null
  if (FOR_VALUES.has(v) || /^pro[\s-]/.test(v)) return 'FOR'           // e.g., Pro-LGBTQ Vote
  if (AGAINST_VALUES.has(v) || /^anti[\s-]/.test(v)) return 'AGAINST'  // e.g., Anti-Choice
  if (ABSENT_PAT.test(v)) return "DIDN'T VOTE"
  if (v === 'y') return 'FOR'
  if (v === 'n') return 'AGAINST'
  return null
}

function labelFromColumn(col: string): string {
  const m = col.match(/(?:VOTE_)?((?:HB|SB|HR|HCR|SCR)\s?(\d{1,4}))(?:[_\-\s]?(\d{4}))?/i)
  if (m) {
    const bill = `${m[1].toUpperCase().replace(/\s+/g, '')}`
    const year = m[3]
    return year ? `${bill} (${year})` : bill
  }
  return col.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

/* ========= Backend JSON helpers ========= */
async function fetchVoteMapJSON(): Promise<{ columns: string[]; votes: Record<string, Record<string, string>> }> {
  const res = await fetch(`${API_BASE}/api/vote-map?ts=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`vote-map HTTP ${res.status}`)
  const j = await res.json()
  return { columns: j.columns || [], votes: j.votes || {} }
}

/* ========= Joins & transforms ========= */
function normKey(s: string) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g,'').trim() }

function normalizeReps(list: RawRep[] | undefined | null): Rep[] {
  if (!list) return []
  return list.map(r => ({
    openstates_person_id: (r as any).openstates_person_id || (r as any).person_id || (r as any).id || '',
    name: (r as any).name || '',
    party: (r as any).party,
    district: (r as any).district,
    email: (r as any).email ?? null,
    phone: (r as any).phone ?? null,
    links: (r as any).links || []
  })).filter(r => r.openstates_person_id || r.name)
}

function getPersonVotes(rep: Rep, votesByPerson: VotesByPerson) {
  return (
    votesByPerson[rep.openstates_person_id] ||
    votesByPerson[`name:${normKey(rep.name)}`] ||
    votesByPerson[`nd:${normKey(rep.name)}|${normKey(rep.district || '')}`] ||
    {}
  )
}

function decideForIssue(
  rep: Rep,
  votesByPerson: VotesByPerson,
  cols: string[],
  pro?: Record<string,'Y'|'N'>
) {
  const pv = getPersonVotes(rep, votesByPerson)
  for (const col of cols) {
    if (!(col in pv)) continue
    const raw = pv[col]
    const norm = normalizeVoteCell(raw)
    if (norm === null) return { decision: "DIDN'T VOTE" as Decision, usedColumn: col, raw }
    if (pro && pro[col]) {
      const p = pro[col]
      if (norm === 'FOR' && p === 'Y') return { decision: 'FOR' as Decision, usedColumn: col, raw }
      if (norm === 'AGAINST' && p === 'N') return { decision: 'FOR' as Decision, usedColumn: col, raw }
      return { decision: 'AGAINST' as Decision, usedColumn: col, raw }
    }
    return { decision: norm, usedColumn: col, raw }
  }
  return { decision: "DIDN'T VOTE" as Decision }
}

/* ========= Page ========= */
export default function Page() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const [reps, setReps] = useState<Rep[]>([])
  const [votesByPerson, setVotesByPerson] = useState<VotesByPerson>({})
  const [voteColumns, setVoteColumns] = useState<string[]>([])
  const [votesReady, setVotesReady] = useState(false)

  const [activeIssueKey, setActiveIssueKey] = useState<string | null>(null)
  const [activeBillCol, setActiveBillCol] = useState<string | null>(null)

  useEffect(() => { setAddress(DEFAULT_ADDRESS) }, [])

  // Preload vote map once for speed
  useEffect(() => {
    (async () => {
      try {
        const { columns, votes } = await fetchVoteMapJSON()
        setVotesByPerson(votes)
        setVoteColumns(columns || [])
        setVotesReady(true)
        if (!ISSUE_MAP.length && columns?.length && !activeBillCol) setActiveBillCol(columns[0])
      } catch { /* ignore; fallback in handleFind */ }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const issues = useMemo(() => {
    const available = new Set(voteColumns)
    return ISSUE_MAP.map(i => ({ ...i, usableColumns: i.columns.filter(c => available.has(c)) }))
                    .filter(i => i.usableColumns.length > 0)
  }, [voteColumns])

  useEffect(() => { if (!activeIssueKey && issues.length) setActiveIssueKey(issues[0].key) }, [issues, activeIssueKey])

  async function handleFind() {
    setAttempted(true)
    setLoading(true)
    setError(null)
    try {
      const repsUrl = new URL(API_BASE + '/api/lookup-legislators')
      repsUrl.searchParams.set('address', address)
      repsUrl.searchParams.set('ts', String(Date.now()))

      if (!votesReady) {
        // First run: reps + vote map in parallel
        const [repsRes, voteMap] = await Promise.all([
          fetch(repsUrl.toString(), { cache: 'no-store' }),
          fetchVoteMapJSON(),
        ])
        if (!repsRes.ok) throw new Error(`HTTP ${repsRes.status}`)
        const j: any = await repsRes.json()
        setReps(normalizeReps((j?.data ?? j as LookupResponse).stateRepresentatives))

        setVotesByPerson(voteMap.votes)
        setVoteColumns(voteMap.columns || [])
        setVotesReady(true)

        if (!ISSUE_MAP.length && !activeBillCol && voteMap.columns?.length) {
          setActiveBillCol(voteMap.columns[0])
        }
      } else {
        // Later runs: reps only
        const repsRes = await fetch(repsUrl.toString(), { cache: 'no-store' })
        if (!repsRes.ok) throw new Error(`HTTP ${repsRes.status}`)
        const j: any = await repsRes.json()
        setReps(normalizeReps((j?.data ?? j as LookupResponse).stateRepresentatives))
      }
    } catch (e: any) {
      setError(e?.message || 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }

  function decideForBill(rep: Rep, col: string | null) {
    if (!col) return { decision: "DIDN'T VOTE" as Decision }
    const pv = getPersonVotes(rep, votesByPerson)
    const raw = pv[col]
    const norm = normalizeVoteCell(raw)
    if (norm === null) return { decision: "DIDN'T VOTE" as Decision, usedColumn: col, raw }
    return { decision: norm, usedColumn: col, raw }
  }

  function verdictFor(rep: Rep) {
    if (activeIssueKey) {
      const issue = issues.find(i => i.key === activeIssueKey)
      if (issue) return decideForIssue(rep, votesByPerson, (issue as any).usableColumns, (issue as any).proVote)
    }
    if (activeBillCol) return decideForBill(rep, activeBillCol)
    return null
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Find Your NH House Rep</h1>

      {/* Address Search */}
      <div className="flex gap-2">
        <input
          aria-label="Enter your address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2"
          placeholder="Enter your address"
        />
        <button
          onClick={handleFind}
          disabled={loading || !address.trim()}
          className="rounded-lg px-4 py-2 border disabled:opacity-50"
        >
          {loading ? 'Finding…' : 'Find'}
        </button>
      </div>

      {error && <div className="text-red-700 text-sm" role="alert">{error}</div>}

      {/* Issues or Bill chips */}
      {issues.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Issues:</div>
          <div className="flex flex-wrap gap-2">
            {issues.map((i) => (
              <button
                key={i.key}
                onClick={() => setActiveIssueKey(i.key)}
                className={`px-3 py-1 rounded-full border text-sm ${activeIssueKey === i.key ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
      ) : voteColumns.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Pick a bill:</div>
          <div className="flex flex-wrap gap-2 overflow-x-auto">
            {voteColumns.slice(0, 60).map((c) => (
              <button
                key={c}
                onClick={() => setActiveBillCol(c)}
                className={`px-3 py-1 rounded-full border text-sm whitespace-nowrap ${activeBillCol === c ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {labelFromColumn(c)}
              </button>
            ))}
          </div>
        </div>
      ) : attempted ? (
        <div className="text-sm text-gray-600">
          No vote columns detected. Confirm <code>/api/vote-map</code> returns columns and votes.
        </div>
      ) : null}

      {/* Verdicts for ALL reps */}
      {reps.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {reps.map((rep) => {
            const v = verdictFor(rep)
            return (
              <div key={rep.openstates_person_id || rep.name} className="rounded-2xl border p-4 shadow-sm">
                <div className="text-sm text-gray-700 font-medium">
                  {rep.name}{rep.district ? ` (${rep.district})` : ''}
                </div>
                <div className="mt-2 text-xl font-bold">
                  {v?.decision === 'FOR' && <span>FOR ✅</span>}
                  {v?.decision === 'AGAINST' && <span>AGAINST ✖</span>}
                  {v?.decision === "DIDN'T VOTE" && <span>DIDN'T VOTE ︱ ?</span>}
                  {!v && <span className="text-gray-500">Select an issue or bill</span>}
                </div>
                {v?.usedColumn && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">Why this answer</summary>
                    <div className="text-sm mt-1">
                      <div>Bill: <strong>{labelFromColumn(v.usedColumn)}</strong></div>
                      <div>
                        {rep.name}'s vote:{' '}
                        <strong>{normalizeVoteCell(getPersonVotes(rep, votesByPerson)?.[v.usedColumn] ?? '') || 'No record'}</strong>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
