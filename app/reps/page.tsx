'use client'

import React, { useEffect, useMemo, useState } from 'react'

// ===== Types (normalized) =====
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
type LookupResponse = {
  address?: string
  geographies?: any
  stateRepresentatives: RawRep[]
  votes?: any
}
type VotesByPerson = Record<string, Record<string, string | null | undefined>>
type Decision = 'FOR' | 'AGAINST' | "DIDN'T SHOW UP"

// ===== Config =====
// If you leave ISSUE_MAP empty, the UI falls back to a Bill Picker (from CSV headers).
const ISSUE_MAP: {
  key: string
  label: string
  columns: string[]
  // If a bill is pro when the vote is "N", set proVote[col] = 'N'
  proVote?: Record<string, 'Y' | 'N'>
}[] = []

const DEFAULT_ADDRESS = '25 Capitol St, Concord, NH 03301'
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''

// ===== Vote normalization =====
const FOR_VALUES = new Set(['y', 'yes', 'aye', 'for'])
const AGAINST_VALUES = new Set(['n', 'no', 'nay', 'against'])
const ABSENT_VALUES = new Set([
  'nv', 'na', 'x', 'excused', 'absent', 'did not vote', 'not voting', "didn't vote", 'present', 'p', 'abstain'
])

function normalizeVoteCell(raw: unknown): Decision | null {
  if (raw == null) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null
  if (FOR_VALUES.has(v)) return 'FOR'
  if (AGAINST_VALUES.has(v)) return 'AGAINST'
  if (ABSENT_VALUES.has(v)) return "DIDN'T SHOW UP"
  if (v === 'y') return 'FOR'
  if (v === 'n') return 'AGAINST'
  return null
}

function labelFromColumn(col: string): string {
  const m = col.match(/(?:VOTE_)?((?:HB|SB|HR|HCR|SCR)\s?\d{1,4})(?:[_\-\s]?(\d{4}))?/i)
  if (m) {
    const bill = m[1].toUpperCase().replace(/\s+/g, '')
    const year = m[2]
    return year ? `${bill} (${year})` : bill
  }
  return col.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

// ===== CSV parsing =====
function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else cur += ch
    } else {
      if (ch === ',') { out.push(cur); cur = '' }
      else if (ch === '"') inQuotes = true
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.length > 0)
  if (!lines.length) return { headers: [], rows: [] }
  const headers = splitCSVLine(lines[0]).map(h => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i])
    const row: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) row[headers[c]] = parts[c] ?? ''
    rows.push(row)
  }
  return { headers, rows }
}

async function fetchVotesCSV(): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const res = await fetch(`${API_BASE}/house_key_votes.csv?ts=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`)
  return parseCSV(await res.text())
}

function buildVotesMapFromCSV(rows: Record<string, string>[]): VotesByPerson {
  const out: VotesByPerson = {}
  for (const r of rows) {
    const id = (r['openstates_person_id'] || r['person_id'] || r['id'] || '').trim()
    if (!id) continue
    const copy: Record<string, string> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k === 'openstates_person_id' || k === 'person_id' || k === 'id' || k === 'name' || k === 'district') continue
      copy[k] = String(v ?? '')
    }
    out[id] = copy
  }
  return out
}

function normalizeReps(list: RawRep[] | undefined | null): Rep[] {
  if (!list) return []
  return list
    .map((r) => ({
      openstates_person_id: (r as any).openstates_person_id || (r as any).person_id || (r as any).id || '',
      name: (r as any).name || '',
      party: (r as any).party,
      district: (r as any).district,
      email: (r as any).email ?? null,
      phone: (r as any).phone ?? null,
      links: (r as any).links || []
    }))
    .filter((r) => r.openstates_person_id)
}

function decideForIssue(
  rep: Rep,
  votesByPerson: VotesByPerson,
  issueColumns: string[],
  proVoteMap?: Record<string, 'Y' | 'N'>
): { decision: Decision; usedColumn?: string; raw?: string | null } {
  const pv = votesByPerson[rep.openstates_person_id] || {}
  for (const col of issueColumns) {
    if (!(col in pv)) continue
    const raw = pv[col]
    const norm = normalizeVoteCell(raw)
    if (norm === null) return { decision: "DIDN'T SHOW UP", usedColumn: col, raw }
    if (proVoteMap && proVoteMap[col]) {
      const pro = proVoteMap[col]
      if (norm === 'FOR' && pro === 'Y') return { decision: 'FOR', usedColumn: col, raw }
      if (norm === 'AGAINST' && pro === 'N') return { decision: 'FOR', usedColumn: col, raw }
      return { decision: 'AGAINST', usedColumn: col, raw }
    }
    return { decision: norm, usedColumn: col, raw }
  }
  return { decision: "DIDN'T SHOW UP" }
}

// ===== Page =====
export default function Page() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [reps, setReps] = useState<Rep[]>([])
  const [votesByPerson, setVotesByPerson] = useState<VotesByPerson>({})

  const [activeRepId, setActiveRepId] = useState<string | null>(null)
  const [activeIssueKey, setActiveIssueKey] = useState<string | null>(null)
  const [activeBillCol, setActiveBillCol] = useState<string | null>(null)

  useEffect(() => { setAddress(DEFAULT_ADDRESS) }, [])

  const voteColumns = useMemo(() => {
    const cols = new Set<string>()
    Object.values(votesByPerson).forEach((r) => Object.keys(r).forEach((k) => cols.add(k)))
    ;['openstates_person_id','person_id','id','name','district'].forEach((k) => cols.delete(k))
    return Array.from(cols).sort()
  }, [votesByPerson])

  const issues = useMemo(() => {
    return ISSUE_MAP.map((i) => ({ ...i, usableColumns: i.columns.filter((c) => voteColumns.includes(c)) }))
                   .filter((i) => i.usableColumns.length > 0)
  }, [voteColumns])

  useEffect(() => { if (!activeRepId && reps.length) setActiveRepId(reps[0].openstates_person_id) }, [reps, activeRepId])
  useEffect(() => { if (!activeIssueKey && issues.length) setActiveIssueKey(issues[0].key) }, [issues, activeIssueKey])
  useEffect(() => { if (!activeBillCol && !issues.length && voteColumns.length) setActiveBillCol(voteColumns[0]) }, [voteColumns, issues, activeBillCol])

  async function handleFind() {
    if (!API_BASE) { setError('NEXT_PUBLIC_API_BASE is not set'); return }
    setLoading(true); setError(null)
    try {
      // 1) reps
      const u = new URL(API_BASE + '/api/lookup-legislators')
      u.searchParams.set('address', address); u.searchParams.set('ts', String(Date.now()))
      const res = await fetch(u.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j: any = await res.json()
      const payload: LookupResponse = (j?.data ?? j) as LookupResponse
      const norm = normalizeReps(payload?.stateRepresentatives)
      setReps(norm)
      if (norm.length) setActiveRepId(norm[0].openstates_person_id)

      // 2) votes CSV
      const { headers, rows } = await fetchVotesCSV()
      const map = buildVotesMapFromCSV(rows)
      setVotesByPerson(map)
      if (!ISSUE_MAP.length) {
        const billCols = headers.filter((h) => !['openstates_person_id','person_id','id','name','district'].includes(h))
        if (billCols.length) setActiveBillCol(billCols[0])
      }
    } catch (e: any) {
      setError(e?.message || 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }

  const activeRep: Rep | null = useMemo(
    () => reps.find((r) => r.openstates_person_id === activeRepId) || null,
    [reps, activeRepId]
  )
  const activeIssue = useMemo(() => issues.find((i) => i.key === activeIssueKey) || null, [issues, activeIssueKey])

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
    if (activeIssue) return decideForIssue(activeRep, votesByPerson, (activeIssue as any).usableColumns, activeIssue.proVote)
    if (activeBillCol) return decideForBill(activeRep, activeBillCol)
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

      {error && <div className="text-red-700 text-sm" role="alert">{error}</div>}

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
      ) : voteColumns.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Pick a bill:</div>
          <div className="flex flex-wrap gap-2">
            {voteColumns.map((c) => (
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
      ) : (
        <div className="text-sm text-gray-600">No vote columns found in CSV.</div>
      )}

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
                  <span>{activeIssue.label}: {labelFromColumn(verdict.usedColumn)}</span>
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
                  <div>Bill: <strong>{labelFromColumn(verdict.usedColumn)}</strong></div>
                  <div>
                    {activeRep.name}'s vote:{' '}
                    <strong>{normalizeVoteCell(votesByPerson[activeRep.openstates_person_id]?.[verdict.usedColumn] ?? '') || 'No record'}</strong>
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Admin hint when no issues configured */}
      {issues.length === 0 && (
        <div className="text-xs text-gray-500">
          Admin note: configure <code>ISSUE_MAP</code> with CSV column names from <code>/debug/votes-preview</code> to enable Issue mode. Until then, the UI falls back to per-bill selection.
        </div>
      )}
    </div>
  )
}
