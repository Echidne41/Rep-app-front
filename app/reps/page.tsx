'use client'

import React, { useEffect, useMemo, useState } from 'react'

// === Types matching current backend ===
// Backend returns /api/lookup-with-votes with reps and a votes payload
// that may be an object keyed by person_id OR an array of rows.

type Rep = {
  openstates_person_id: string
  name: string
  party?: string
  district?: string
  email?: string | null
  phone?: string | null
  links?: Array<{ url: string; note?: string }>
}

type LookupResponse = {
  address?: string
  geographies?: any
  stateRepresentatives: Rep[]
  votes?: any
}

type VotesByPerson = Record<string, Record<string, string | null | undefined>>

type Decision = 'FOR' | 'AGAINST' | "DIDN'T SHOW UP"

// === Config ===
// Issue → ordered bill columns (most representative first) and, optionally, pro-vote mapping per bill.
// If a bill column listed here does NOT exist in the CSV, we gracefully skip it.
// If you omit pro mapping for a bill, 'Y/YES/Aye' is treated as FOR the issue by default.

const ISSUE_MAP: {
  key: string
  label: string
  columns: string[]
  proVote?: Record<string, 'Y' | 'N'>
}[] = [
  // EXAMPLES — replace column names with real CSV headers from /debug/votes-preview
  // {
  //   key: 'repro',
  //   label: 'Reproductive Freedom',
  //   columns: ['VOTE_HB1609_2025', 'VOTE_SB123_2025'],
  //   proVote: { VOTE_HB1609_2025: 'Y', VOTE_SB123_2025: 'N' }
  // },
  // {
  //   key: 'schools',
  //   label: 'Public Schools',
  //   columns: ['VOTE_HB200_2025']
  // }
]

// Default example address — NOT a residence
const DEFAULT_ADDRESS = '25 Capitol St, Concord, NH 03301'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''

// Robust truth-table for vote strings
const FOR_VALUES = new Set(['y', 'yes', 'aye', 'for'])
const AGAINST_VALUES = new Set(['n', 'no', 'nay', 'against'])
const ABSENT_VALUES = new Set(['nv', 'na', 'x', 'excused', 'absent', 'did not vote', 'not voting', 'didn\'t vote', 'present', 'p', 'abstain'])

function normalizeVoteCell(raw: unknown): Decision | null {
  if (raw == null) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null
  if (FOR_VALUES.has(v)) return 'FOR'
  if (AGAINST_VALUES.has(v)) return 'AGAINST'
  if (ABSENT_VALUES.has(v)) return "DIDN'T SHOW UP"
  // Common single-letter and CSV quirks
  if (v === 'y') return 'FOR'
  if (v === 'n') return 'AGAINST'
  return null // unknown encoding → treat as no-record; caller will map to DIDN'T SHOW UP
}

function labelFromColumn(col: string): string {
  // Try to extract HB/SB and year: VOTE_HB123_2025 → HB123 (2025)
  const m = col.match(/(?:VOTE_)?((?:HB|SB|HR|HCR|SCR)\s?\d{1,4})(?:[_\-\s]?(\d{4}))?/i)
  if (m) {
    const bill = m[1].toUpperCase().replace(/\s+/g, '')
    const year = m[2]
    return year ? `${bill} (${year})` : bill
  }
  return col
}

function normalizeVotesPayload(votes: any): VotesByPerson {
  let v: any = votes
  if (!v) return {}
  // Unwrap common wrappers: { data: [...] } or { rows: [...] }
  if (v && typeof v === 'object' && 'data' in v && (v as any).data != null) v = (v as any).data
  if (v && typeof v === 'object' && 'rows' in v && Array.isArray((v as any).rows)) v = (v as any).rows

  // Case 1: array of rows
  if (Array.isArray(v)) {
    const out: VotesByPerson = {}
    for (const row of v) {
      const id = (row as any).openstates_person_id || (row as any).person_id || (row as any).id
      if (!id) continue
      const copy: Record<string, string> = {}
      for (const [k, val] of Object.entries(row as any)) {
        if (k === 'openstates_person_id' || k === 'name' || k === 'district') continue
        copy[k] = String(val ?? '')
      }
      out[id] = copy
    }
    return out
  }

  // Case 2: object keyed by person id
  if (v && typeof v === 'object') {
    return v as VotesByPerson
  }
  return {}
}

function availableVoteColumns(votesByPerson: VotesByPerson): string[] {
  // Union of keys across people, excluding id/name/district
  const cols = new Set<string>()
  Object.values(votesByPerson).forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (k === 'openstates_person_id' || k === 'name' || k === 'district') return
      cols.add(k)
    })
  })
  return Array.from(cols).sort()
}

function decideForIssue(
  rep: Rep,
  votesByPerson: VotesByPerson,
  issueColumns: string[],
  proVoteMap?: Record<string, 'Y' | 'N'>
): { decision: Decision; usedColumn?: string; raw?: string | null } {
  const pv = votesByPerson[rep.openstates_person_id] || {}
  // Use the first listed column that exists for this person
  for (const col of issueColumns) {
    if (!(col in pv)) continue
    const raw = pv[col]
    const norm = normalizeVoteCell(raw)
    if (norm === null) return { decision: "DIDN'T SHOW UP", usedColumn: col, raw }
    // If we have a pro mapping, reinterpret FOR/AGAINST relative to the issue
    if (proVoteMap && proVoteMap[col]) {
      const pro = proVoteMap[col]
      if (norm === 'FOR' && pro === 'Y') return { decision: 'FOR', usedColumn: col, raw }
      if (norm === 'AGAINST' && pro === 'N') return { decision: 'FOR', usedColumn: col, raw }
      return { decision: 'AGAINST', usedColumn: col, raw }
    }
    // Default: treat FOR vote as FOR the issue
    return { decision: norm, usedColumn: col, raw }
  }
  // No listed bill found for this person → classify as didn't show up for this issue
  return { decision: "DIDN'T SHOW UP" }
}

export default function Page() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LookupResponse | null>(null)
  const [activeRepId, setActiveRepId] = useState<string | null>(null)
  const [activeIssueKey, setActiveIssueKey] = useState<string | null>(null)

  useEffect(() => {
    // Pre-fill with a safe, public address but do NOT auto-fetch
    setAddress(DEFAULT_ADDRESS)
  }, [])

  const reps: Rep[] = useMemo(() => data?.stateRepresentatives || [], [data])

  const votesByPerson = useMemo(() => normalizeVotesPayload(data?.votes), [data])
  const voteColumns = useMemo(() => availableVoteColumns(votesByPerson), [votesByPerson])

  // Compute which issues are actually usable with available columns
  const issues = useMemo(() => {
    return ISSUE_MAP.map((i) => ({
      ...i,
      usableColumns: i.columns.filter((c) => voteColumns.includes(c))
    })).filter((i) => i.usableColumns.length > 0)
  }, [voteColumns])

  useEffect(() => {
    if (!activeRepId && reps.length) setActiveRepId(reps[0].openstates_person_id)
  }, [reps, activeRepId])

  useEffect(() => {
    if (!activeIssueKey && issues.length) setActiveIssueKey(issues[0].key)
  }, [issues, activeIssueKey])

  async function handleFind() {
    if (!API_BASE) {
      setError('NEXT_PUBLIC_API_BASE is not set')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const url = new URL(API_BASE + '/api/lookup-with-votes')
      url.searchParams.set('address', address)
      url.searchParams.set('refreshVotes', '1')
      url.searchParams.set('ts', String(Date.now()))
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j: any = await res.json()
      const payload: LookupResponse = (j && typeof j === 'object' && 'data' in j && j.data)
        ? (j.data as LookupResponse)
        : (j as LookupResponse)
      setData(payload)
      if (payload.stateRepresentatives?.length) {
        setActiveRepId(payload.stateRepresentatives[0].openstates_person_id)
      }
    } catch (e: any) {
      setError(e?.message || 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }

  const activeRep: Rep | null = useMemo(() => reps.find((r) => r.openstates_person_id === activeRepId) || null, [reps, activeRepId])

  const activeIssue = useMemo(() => issues.find((i) => i.key === activeIssueKey) || null, [issues, activeIssueKey])

  // Fallback: if no issues configured/usable, expose a Bill Picker from whatever columns are present
  const billFallbackColumns = useMemo(() => {
    if (issues.length > 0) return [] as string[]
    return voteColumns
      .filter((c) => !['openstates_person_id', 'name', 'district'].includes(c))
      .slice(0, 30) // keep it tidy
  }, [issues, voteColumns])

  const [activeBillCol, setActiveBillCol] = useState<string | null>(null)
  useEffect(() => {
    if (!activeBillCol && billFallbackColumns.length) setActiveBillCol(billFallbackColumns[0])
  }, [billFallbackColumns, activeBillCol])

  function decideForBill(rep: Rep, col: string | null): { decision: Decision; usedColumn?: string; raw?: string | null } {
    if (!col) return { decision: "DIDN'T SHOW UP" }
    const pv = votesByPerson[rep.openstates_person_id] || {}
    const raw = pv[col]
    const norm = normalizeVoteCell(raw)
    if (norm === null) return { decision: "DIDN'T SHOW UP", usedColumn: col, raw }
    return { decision: norm, usedColumn: col, raw }
  }

  const verdict = useMemo(() => {
    if (!activeRep) return null
    if (activeIssue) {
      return decideForIssue(activeRep, votesByPerson, activeIssue.usableColumns, activeIssue.proVote)
    }
    if (activeBillCol) {
      return decideForBill(activeRep, activeBillCol)
    }
    return null
  }, [activeRep, votesByPerson, activeIssue, activeBillCol])

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

      {error && (
        <div className="text-red-700 text-sm" role="alert">{error}</div>
      )}

      {/* Reps Switcher */}
      {reps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-sm text-gray-600">Reps:</span>
          {reps.map((r) => (
            <button
              key={r.openstates_person_id}
              onClick={() => setActiveRepId(r.openstates_person_id)}
              className={`px-3 py-1 rounded-full border text-sm ${
                activeRepId === r.openstates_person_id ? 'bg-gray-900 text-white' : 'bg-white'
              }`}
            >
              {r.name}{r.district ? ` (${r.district})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Issue Picker or Bill Fallback */}
      {issues.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Issues:</div>
          <div className="flex flex-wrap gap-2">
            {issues.map((i) => (
              <button
                key={i.key}
                onClick={() => setActiveIssueKey(i.key)}
                className={`px-3 py-1 rounded-full border text-sm ${
                  activeIssueKey === i.key ? 'bg-gray-900 text-white' : 'bg-white'
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
      ) : billFallbackColumns.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Pick a bill:</div>
          <div className="flex flex-wrap gap-2">
            {billFallbackColumns.map((c) => (
              <button
                key={c}
                onClick={() => setActiveBillCol(c)}
                className={`px-3 py-1 rounded-full border text-sm ${
                  activeBillCol === c ? 'bg-gray-900 text-white' : 'bg-white'
                }`}
              >
                {labelFromColumn(c)}
              </button>
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="text-sm text-gray-600">No vote columns found in CSV.</div>
      ) : null}

      {/* Verdict Card */}
      {activeRep && verdict && (
        <div aria-live="polite" className="mt-2">
          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="text-xs uppercase text-gray-500">Result</div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-xl font-bold">
                {verdict.decision === 'FOR' && <span>FOR ✅</span>}
                {verdict.decision === 'AGAINST' && <span>AGAINST ✖</span>}
                {verdict.decision === "DIDN'T SHOW UP" && <span>DIDN'T SHOW UP ︱ ?</span>}
              </div>
              <div className="text-sm text-gray-600">
                {activeIssue && verdict.usedColumn && (
                  <span>
                    {activeIssue.label}: {labelFromColumn(verdict.usedColumn)}
                  </span>
                )}
                {!activeIssue && verdict.usedColumn && (
                  <span>{labelFromColumn(verdict.usedColumn)}</span>
                )}
              </div>
            </div>
            {verdict.usedColumn && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm">Why this answer</summary>
                <div className="text-sm mt-1">
                  <div>
                    Bill: <strong>{labelFromColumn(verdict.usedColumn)}</strong>
                  </div>
                  <div>
                    {activeRep.name}'s vote: <strong>{normalizeVoteCell(votesByPerson[activeRep.openstates_person_id]?.[verdict.usedColumn] ?? '') || "No record"}</strong>
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Helper note when no issues configured */}
      {issues.length === 0 && (
        <div className="text-xs text-gray-500">
          Admin note: configure <code>ISSUE_MAP</code> with CSV column names from <code>/debug/votes-preview</code> to enable Issue mode. Until then, the UI falls back to per‑bill selection without mixing outcomes.
        </div>
      )}
    </div>
  )
}
