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

/* ========= Config (optional issue chips). Leave empty to use Bill chips ========= */
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
  'https://nh-rep-finder-api-staging.onrender.com' // safe fallback for staging

/* ========= Vote normalization ========= */
const FOR_VALUES = new Set(['y','yes','aye','yea','for','support','supported','in favor','in favour'])
const AGAINST_VALUES = new Set(['n','no','nay','against','oppose','opposed'])
const ABSENT_PAT = /(did\s*not\s*vote|didn.?t\s*vote|not\s*vot|no\s*vote|nv|excused|absent|present|abstain)/i

function normalizeVoteCell(raw: unknown): 'FOR' | 'AGAINST' | "DIDN'T VOTE" | null {
  if (raw == null) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null

  // FOR
  if (
    v === 'y' || v === 'yes' || v === 'aye' || v === 'yea' || v === 'for' ||
    v.includes('in favor') || v.includes('support') || v.includes('supported') ||
    /^pro[\s-]/.test(v)  // e.g., "Pro-LGBTQ Vote"
  ) return 'FOR'

  // AGAINST
  if (
    v === 'n' || v === 'no' || v === 'nay' || v === 'against' ||
    v.includes('oppose') || v.includes('opposed') ||
    /^anti[\s-]/.test(v) // e.g., "Anti-Choice"
  ) return 'AGAINST'

  // DIDN'T VOTE / absent / excused / present / abstain
  if (/(did\s*not\s*vote|didn.?t\s*vote|not\s*vot|no\s*vote|nv|excused|absent|present|abstain)/.test(v))
    return "DIDN'T VOTE"

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

/* ========= CSV / JSON helpers ========= */
function splitCSVLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++ } else { inQuotes = false } }
      else cur += ch
    } else {
      if (ch === ',') { out.push(cur); cur = '' }
      else if (ch === '"') inQuotes = true
      else cur += ch
    }
  }
  out.push(cur); return out
}
function parseCSV(text: string): { headers: string[]; rows: Record<string,string>[] } {
  const lines = text.replace(/\r\n?/g,'\n').split('\n').filter(l => l.length>0)
  if (!lines.length) return { headers: [], rows: [] }
  const headers = splitCSVLine(lines[0]).map(h => h.trim())
  const rows: Record<string,string>[] = []
  for (let i=1;i<lines.length;i++) {
    const parts = splitCSVLine(lines[i]); const row: Record<string,string> = {}
    for (let c=0;c<headers.length;c++) row[headers[c]] = parts[c] ?? ''
    rows.push(row)
  }
  return { headers, rows }
}
async function fetchVotesCSV() {
  const res = await fetch(`${API_BASE}/house_key_votes.csv?ts=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`)
  return parseCSV(await res.text())
}
async function fetchVotesPreviewJSON(): Promise<Record<string,string>[]> {
  const url = `${API_BASE}/debug/votes-preview?ts=${Date.now()}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`preview HTTP ${r.status}`)
  const j: any = await r.json()
  const rows: any[] =
    Array.isArray(j) ? j :
    Array.isArray(j?.data) ? j.data :
    Array.isArray(j?.rows) ? j.rows : []

  // If preview rows don't contain ANY id/name info, reject so we fall back to CSV
  const hasPersonFields = rows.some(
    (x) => x?.openstates_person_id || x?.person_id || x?.id || x?.name
  )
  return hasPersonFields ? (rows as Record<string,string>[]) : []
}


function normKey(s: string) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g,'').trim() }
function extractBillKey(str: string): string {
  const s = String(str || '')
  const m = s.match(/(HB|SB|HR|HCR|SCR)\s*-?\s*(\d{1,4})(?:.*?(\d{4}))?/i)
  if (m) {
    const bill = `${m[1].toUpperCase()}${m[2]}`
    const year = m[3]
    return year ? `${bill}_${year}` : bill
  }
  return s.replace(/[^A-Za-z0-9]+/g,'_').toUpperCase()
}

/* Build person→{bill:rawVote} from long OR wide rows */
function buildVotesMap(rows: Record<string,string>[]): VotesByPerson {
  const out: VotesByPerson = {}
  const isLong = rows.some(r => 'bill' in r && 'vote' in r)

  if (isLong) {
    for (const r of rows) {
      const id = (r['openstates_person_id'] || r['person_id'] || r['id'] || '').trim()
      if (!id) continue
      const billKey = extractBillKey(r['bill'])
      const val = String(r['vote'] ?? '')
      if (!out[id]) out[id] = {}
      out[id][billKey] = val

      const nameKey = normKey(String(r['name'] || ''))
      const distKey = normKey(String(r['district'] || ''))
      if (nameKey) out[`name:${nameKey}`] = out[id]
      if (nameKey || distKey) out[`nd:${nameKey}|${distKey}`] = out[id]
    }
    return out
  }

  // wide
  for (const r of rows) {
    const id = (r['openstates_person_id'] || r['person_id'] || r['id'] || '').trim()
    if (!id) continue
    const copy: Record<string,string> = {}
    for (const [k,v] of Object.entries(r)) {
      if (['openstates_person_id','person_id','id','name','district'].includes(k)) continue
      copy[k] = String(v ?? '')
    }
    out[id] = copy

    const nameKey = normKey(String(r['name'] || ''))
    const distKey = normKey(String(r['district'] || ''))
    if (nameKey) out[`name:${nameKey}`] = copy
    if (nameKey || distKey) out[`nd:${nameKey}|${distKey}`] = copy
  }
  return out
}

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
  })).filter(r => r.openstates_person_id)
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

  const [activeIssueKey, setActiveIssueKey] = useState<string | null>(null)
  const [activeBillCol, setActiveBillCol] = useState<string | null>(null)

  useEffect(() => { setAddress(DEFAULT_ADDRESS) }, [])

  const voteColumns = useMemo(() => {
    const cols = new Set<string>()
    Object.values(votesByPerson).forEach(r => Object.keys(r).forEach(k => cols.add(k)))
    ;['openstates_person_id','person_id','id','name','district'].forEach(k => cols.delete(k))
    return Array.from(cols).sort()
  }, [votesByPerson])

  const issues = useMemo(() => {
    return ISSUE_MAP.map(i => ({ ...i, usableColumns: i.columns.filter(c => voteColumns.includes(c)) }))
                    .filter(i => i.usableColumns.length > 0)
  }, [voteColumns])

  useEffect(() => { if (!activeIssueKey && issues.length) setActiveIssueKey(issues[0].key) }, [issues, activeIssueKey])
  useEffect(() => { if (!activeBillCol && !issues.length && voteColumns.length) setActiveBillCol(voteColumns[0]) }, [voteColumns, issues, activeBillCol])

  async function handleFind() {
    setAttempted(true)
    if (!API_BASE) { setError('NEXT_PUBLIC_API_BASE is not set'); return }
    setLoading(true); setError(null)
    try {
      // reps
      const u = new URL(API_BASE + '/api/lookup-legislators')
      u.searchParams.set('address', address); u.searchParams.set('ts', String(Date.now()))
      const res = await fetch(u.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j: any = await res.json()
      setReps(normalizeReps((j?.data ?? j as LookupResponse).stateRepresentatives))

      // votes: preview JSON → CSV fallback
      let rows: Record<string,string>[] = []
      try { rows = await fetchVotesPreviewJSON() } catch {}
      if (!rows || rows.length === 0) {
        const csv = await fetchVotesCSV()
        rows = csv.rows
      }
      const map = buildVotesMap(rows)
      setVotesByPerson(map)

      if (!ISSUE_MAP.length) {
        const derivedCols = new Set<string>()
        Object.values(map).forEach(row => Object.keys(row).forEach(k => derivedCols.add(k)))
        const billCols = Array.from(derivedCols)
          .filter(h => !['openstates_person_id','person_id','id','name','district'].includes(h))
          .sort()
        if (billCols.length) setActiveBillCol(billCols[0])
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
          No vote columns detected. Confirm <code>/debug/votes-preview</code> or <code>/house_key_votes.csv</code> returns rows.
        </div>
      ) : null}

      {/* Verdicts for ALL reps */}
      {reps.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {reps.map((rep) => {
            const v = verdictFor(rep)
            return (
              <div key={rep.openstates_person_id} className="rounded-2xl border p-4 shadow-sm">
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
