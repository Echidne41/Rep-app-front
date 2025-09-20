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
type IssueDef = { key: string; label: string; columns: string[]; proVote?: Record<string,'Y'|'N'> }

/* ========= Config ========= */
/** Manual issues using your exact column headers (typos included), but clean labels on buttons. */
const ISSUE_MAP_MANUAL: IssueDef[] = [
  {
    key: 'budget',
    label: 'State Budget',
    columns: [
      'HB1 - State Funding Bill',
      'HB2 - Budget Trailer (All the Policy Stuff)',
      'HB25 - The Dems Budget Proposal',
    ],
  },
  {
    key: 'schools',
    label: 'Public School Funding (K-12)',
    columns: [
      'HB115-Public School Funding (Vouchers)',
      'HB211 - Public School Funding',
      'HB214 Public School Funding',
      'HB675 - School Funding Cap',
      'HB26 - School Budget Cap Repeal',
    ],
  },
  {
    key: 'higher_ed',
    label: 'Higher Education Funding',
    columns: ['HB212 - Higher Ed Funding'],
  },
  {
    key: 'lgbtq',
    label: 'LGBTQ Rights',
    columns: ['HB148 - LGBTQ Rights', 'HB22 - Portecting Trans People'],
  },
  {
    key: 'repro',
    label: 'Reproductive Freedom',
    columns: ['HCR- Reproductive Freedom', 'HB27 - Family Planning Services'],
    // If “No” is the pro stance for a specific bill, add: proVote: { 'Exact Column Header': 'N' }
  },
  {
    key: 'child_family_health',
    label: 'Child & Family Health/Safety',
    columns: [
      'HB29 - Medicaid',
      'HB583 - Reducing Child Hunger',
      'HB28 - Child Advocacy Services (Intervening in Child Neglect/Abuse)',
      'HB433 -Child Marriage',
    ],
  },
  {
    key: 'public_health',
    label: 'Public Health & Vaccinations',
    columns: ['HB23 - Vaccinations'],
  },
  {
    key: 'labor',
    label: 'Labor Rights',
    columns: ['HB238 - Labor Rights'],
  },
  {
    key: 'guns',
    label: 'Gun Safety',
    columns: ['HB24 - Gun Control'],
  },
  {
    key: 'democracy',
    label: 'Voter Protection & Democracy',
    columns: ['HB521 Voter Protection'],
  },
  {
    key: 'energy_env',
    label: 'Energy & Environment',
    columns: ['HCR4 - Environment (Wind Power)'],
  },
  {
    key: 'arts',
    label: 'Arts & Culture',
    columns: ['HB210 - Supprting the Arts'],
  },
  {
    key: 'opioids',
    label: 'Opioid Crisis',
    columns: ['HB213 - Dealing with the Opioid Crisis'],
  },
  {
    key: 'cannabis',
    label: 'Cannabis Legalization',
    columns: ['HB75 Legalizing Marijuana'],
  },
  {
    key: 'human_rights_commission',
    label: 'Human Rights Commission',
    columns: ['HB215 - Human Rights Commision'],
  },
]

/* ========= Constants ========= */
const DEFAULT_ADDRESS = '25 Capitol St, Concord, NH 03301'
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://nh-rep-finder-api-staging.onrender.com' // staging fallback

/* ========= Normalizers / helpers ========= */
const FOR_VALUES = new Set(['y','yes','aye','yea','for','support','supported','in favor','in favour'])
const AGAINST_VALUES = new Set(['n','no','nay','against','oppose','opposed'])
const ABSENT_PAT = /(did\s*not\s*vote|didn.?t\s*vote|not\s*vot|no\s*vote|nv|excused|absent|present|abstain)/i

function normalizeVoteCell(raw: unknown): Decision | null {
  if (raw == null) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null
  if (FOR_VALUES.has(v) || /^pro[\s-]/.test(v)) return 'FOR'           // e.g., Pro-LGBTQ
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

async function fetchVoteMapJSON(): Promise<{ columns: string[]; votes: Record<string, Record<string, string>> }> {
  const res = await fetch(`${API_BASE}/api/vote-map?ts=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`vote-map HTTP ${res.status}`)
  const j = await res.json()
  const cols = Array.isArray(j.columns) ? j.columns : []
  return { columns: cols, votes: j.votes || {} }
}

async function fetchBillLink(billOrLabel: string): Promise<string> {
  const params = new URLSearchParams()
  params.set('label', billOrLabel)
  const res = await fetch(`${API_BASE}/api/bill-link?${params.toString()}`, { cache: 'force-cache' })
  if (!res.ok) return ''
  const j = await res.json()
  return j?.url || ''
}

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

/** Filter out non-vote keys that might sneak into columns */
function isNonVoteKey(k: string) {
  const lk = k.toLowerCase()
  return (
    lk === 'openstates_person_id' || lk === 'person_id' || lk === 'id' ||
    lk === 'name' || lk === 'district' || lk === 'party' ||
    lk === 'bill' || lk === 'vote'
  )
}

/* ========= Decisions ========= */
function decideForIssue(
  rep: Rep,
  votesByPerson: VotesByPerson,
  cols: string[],
  pro?: Record<string,'Y'|'N'>
): { decision: Decision; usedColumn?: string; raw?: string | null } {
  const pv = getPersonVotes(rep, votesByPerson)
  for (const col of cols) {
    if (!(col in pv)) continue
    const raw = pv[col]
    const norm = normalizeVoteCell(raw)
    if (norm === null) return { decision: "DIDN'T VOTE", usedColumn: col, raw }
    if (pro && pro[col]) {
      const p = pro[col]
      if (norm === 'FOR' && p === 'Y') return { decision: 'FOR', usedColumn: col, raw }
      if (norm === 'AGAINST' && p === 'N') return { decision: 'FOR', usedColumn: col, raw }
      return { decision: 'AGAINST', usedColumn: col, raw }
    }
    return { decision: norm, usedColumn: col, raw }
  }
  return { decision: "DIDN'T VOTE" }
}

function decideForBill(rep: Rep, col: string | null, votesByPerson: VotesByPerson) {
  if (!col) return { decision: "DIDN'T VOTE" as Decision }
  const pv = getPersonVotes(rep, votesByPerson)
  const raw = pv[col]
  const norm = normalizeVoteCell(raw)
  if (norm === null) return { decision: "DIDN'T VOTE" as Decision, usedColumn: col, raw }
  return { decision: norm, usedColumn: col, raw }
}

/* ========= Small component: bill link button ========= */
function BillLink({ label }: { label: string }) {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    let alive = true
    ;(async () => {
      const u = await fetchBillLink(label)
      if (alive) setUrl(u)
    })()
    return () => { alive = false }
  }, [label])

  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`px-2 py-1 rounded border text-sm ${url ? 'hover:underline' : 'opacity-50 pointer-events-none'}`}
      title={url ? 'Open bill text' : 'Looking up bill link…'}
    >
      {labelFromColumn(label)}
    </a>
  )
}

/* ========= Page ========= */
export default function Page() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const [reps, setReps] = useState<Rep[]>([])
  const [votesByPerson, setVotesByPerson] = useState<VotesByPerson>({})
  const [rawVoteColumns, setRawVoteColumns] = useState<string[]>([])
  const [votesReady, setVotesReady] = useState(false)

  const [activeIssueKey, setActiveIssueKey] = useState<string | null>(null)
  const [activeBillCol, setActiveBillCol] = useState<string | null>(null)

  useEffect(() => { setAddress(DEFAULT_ADDRESS) }, [])

  // Preload vote map once for speed
  useEffect(() => {
    (async () => {
      try {
        const { columns, votes } = await fetchVoteMapJSON()
        const filteredCols = (columns || []).filter((c) => !isNonVoteKey(c))
        setVotesByPerson(votes)
        setRawVoteColumns(filteredCols)
        setVotesReady(true)

        // Prefer issues if possible; else fall back to first bill column
        if (ISSUE_MAP_MANUAL.length > 0) {
          if (!activeIssueKey) setActiveIssueKey(ISSUE_MAP_MANUAL[0].key)
        } else if (filteredCols.length && !activeBillCol) {
          setActiveBillCol(filteredCols[0])
        }
      } catch { /* ignore; fallback during Find */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build issues: manual > none (we’re not auto-deriving in this file since you provided a map)
  const issues: IssueDef[] = useMemo(() => {
    if (!ISSUE_MAP_MANUAL.length) return []
    const available = new Set(rawVoteColumns)
    return ISSUE_MAP_MANUAL
      .map(i => ({ ...i, columns: i.columns.filter(c => available.has(c)) }))
      .filter(i => i.columns.length > 0)
  }, [rawVoteColumns])

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

        const filteredCols = (voteMap.columns || []).filter((c) => !isNonVoteKey(c))
        setVotesByPerson(voteMap.votes)
        setRawVoteColumns(filteredCols)
        setVotesReady(true)

        if (ISSUE_MAP_MANUAL.length > 0) {
          if (!activeIssueKey) setActiveIssueKey(ISSUE_MAP_MANUAL[0].key)
        } else if (filteredCols.length && !activeBillCol) {
          setActiveBillCol(filteredCols[0])
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

  function verdictFor(rep: Rep) {
    if (activeIssueKey) {
      const issue = issues.find(i => i.key === activeIssueKey)
      if (issue) return decideForIssue(rep, votesByPerson, issue.columns, issue.proVote)
    }
    if (activeBillCol) return decideForBill(rep, activeBillCol, votesByPerson)
    return null
  }

  function partyTag(party?: string) {
    const p = (party || '').toLowerCase()
    if (p.startsWith('dem')) return { text: 'D', className: 'bg-blue-100 text-blue-800' }
    if (p.startsWith('rep')) return { text: 'R', className: 'bg-red-100 text-red-800' }
    if (p.startsWith('ind')) return { text: 'IND', className: 'bg-gray-200 text-gray-800' }
    return { text: (party || '').slice(0,3).toUpperCase(), className: 'bg-gray-200 text-gray-800' }
  }

  const hasIssues = issues.length > 0
  const billColumns = useMemo(() => rawVoteColumns.filter(c => !isNonVoteKey(c)), [rawVoteColumns])

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

      {/* Issue buttons (preferred) or Bill chips (fallback) */}
      {hasIssues ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Issues:</div>
          <div className="flex flex-wrap gap-2">
            {issues.map((i) => (
              <button
                key={i.key}
                onClick={() => { setActiveIssueKey(i.key); setActiveBillCol(null) }}
                className={`px-3 py-1 rounded-full border text-sm ${activeIssueKey === i.key ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
      ) : billColumns.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Pick a bill:</div>
          <div className="flex flex-wrap gap-2 overflow-x-auto">
            {billColumns.slice(0, 60).map((c) => (
              <button
                key={c}
                onClick={() => { setActiveBillCol(c); setActiveIssueKey(null) }}
                className={`px-3 py-1 rounded-full border text-sm whitespace-nowrap ${activeBillCol === c ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {labelFromColumn(c)}
              </button>
            ))}
          </div>
        </div>
      ) : attempted ? (
        <div className="text-sm text-gray-600">No vote columns detected. Confirm <code>/api/vote-map</code> returns columns and votes.</div>
      ) : null}

      {/* Verdicts for ALL reps */}
      {reps.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {reps.map((rep) => {
            const v = verdictFor(rep)
            const pt = partyTag(rep.party)
            return (
              <div key={rep.openstates_person_id || rep.name} className="rounded-2xl border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                  <span>{rep.name}{rep.district ? ` (${rep.district})` : ''}</span>
                  {rep.party && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${pt.className}`}>
                      {pt.text}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xl font-bold">
                  {v?.decision === 'FOR' && <span>FOR ✅</span>}
                  {v?.decision === 'AGAINST' && <span>AGAINST ✖</span>}
                  {v?.decision === "DIDN'T VOTE" && <span>DIDN'T VOTE ︱ ?</span>}
                  {!v && <span className="text-gray-500">Select an issue or bill</span>}
                </div>

                {/* Bill link + rationale */}
                {v?.usedColumn && (
                  <>
                    <div className="mt-2">
                      <BillLink label={v.usedColumn} />
                    </div>
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
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
