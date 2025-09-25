// app/lib/api.ts
const BASE = (process.env.NEXT_PUBLIC_BACKEND_BASE || '').replace(/\/+$/, '');

async function getJSON(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  let body: any = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status}${body ? ': ' + JSON.stringify(body) : ''}`);
  return body;
}

export async function lookupLegislators(address: string) {
  const url = `${BASE}/api/lookup-legislators?address=${encodeURIComponent(address)}`;
  return getJSON(url);
}

export async function keyVotes(person_id?: string, name?: string, district?: string) {
  const q = new URLSearchParams({ person_id: person_id || '', name: name || '', district: district || '' });
  const url = `${BASE}/api/key-votes?${q.toString()}`;
  return getJSON(url);
}
