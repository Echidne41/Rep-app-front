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
type LookupResponse = { address?: string; geographies?: any; stateRepresentatives: RawRep[] }
type VotesByPerson = Record<string, Record<string, string | null | undefined>>
type Decision = 'FOR' | 'AGAINST' | "DIDN'T VOTE"

// ===== Config: add issue chips here (use exact CSV headers) =====
const ISSUE_MAP: {
  key: string; label: string; columns: string[]; proVote?: Record<string, 'Y' | 'N'>
}[] = [
  // Example:
  // { key: 'schools', label: 'Public School Funding', columns: ['HB210_2025','HB583_2025'] },
  // { key: 'repro',   label: 'Reproductive Freedom', columns: ['HB1_2025'], proVote: { HB1_2025: 'N' } },
]

// Public building (not a residence)
const DEFAULT_ADDRESS = '25 Capitol St, Concord, NH 03301'
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''

// ===== Vote normalization =====
const FOR_VALUES = new Set(['y', 'yes', 'aye', 'for'])
const AGAINST_VALUES = new Set(['n', 'no', 'nay', 'against'])
const ABSENT_VALUES = new Set([
  'nv','na','x','excused','absent','did not vote',"didn't vote",'didn’t vote','not voting','no vote','present','p','abstain'
])
function normalizeVoteCell(raw: unknown): Decision | null {
  if (raw == null) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null
  if (FOR_VALUES.has(v)) return 'FOR'
  if (AGAINST_VALUES.has(v)) return 'AGAINST'
  if (ABSENT_VALUES.has(v)) return "DIDN'T VOTE"
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
  const out: string[] = []; let cur = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
