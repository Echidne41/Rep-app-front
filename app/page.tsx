"use client";

import { useState } from "react";

type Rep = {
  id?: string;
  name: string;
  party: string;
  district: string;
  email?: string | null;
  phone?: string | null;
  links?: string[];
};
type Vote = { bill: string; vote: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000";

function cls(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

function censusToOpenStates(s?: string | null) {
  if (!s) return "";
  const m = s.trim().match(/([A-Za-z]+)\s+0*(\d+)$/);
  return m ? `${m[1]} ${m[2]}` : s;
}

export default function Page() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseDistrict, setBaseDistrict] = useState("");
  const [reps, setReps] = useState<Rep[]>([]);
  const [votes, setVotes] = useState<Record<string, Vote[]>>({});

  async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, init);
    const j = await r.json();
    if (!r.ok || (j as any)?.success === false) {
      const msg = (j as any)?.error?.message || r.statusText || "Request failed";
      throw new Error(msg);
    }
    return j as T;
  }

  async function onSearch() {
    setLoading(true);
    setError(null);
    setReps([]);
    setVotes({});
    try {
      const data = await fetchJSON<{ success: true; data: any }>(
        `${API_BASE}/api/lookup-legislators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr }),
        }
      );

      const sldlRaw: string | undefined = data.data?.geographies?.sldl?.name;
      const base = censusToOpenStates(sldlRaw);
      setBaseDistrict(base);

      const got: Rep[] = (data.data?.stateRepresentatives ?? []) as Rep[];
      setReps(got);

      await Promise.all(
        got.map(async (r) => {
          try {
            const q = r.id
              ? `${API_BASE}/api/key-votes?person_id=${encodeURIComponent(r.id)}`
              : `${API_BASE}/api/key-votes?name=${encodeURIComponent(
                  r.name
                )}&district=${encodeURIComponent(r.district)}`;
            const kv = await fetchJSON<{ success: true; data: { votes: Vote[] } }>(q);
            setVotes((prev) => ({ ...prev, [r.name + "|" + r.district]: kv.data.votes }));
          } catch {
            /* ignore per-rep vote errors */
          }
        })
      );
    } catch (e: any) {
      setError(e?.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function partyPill(party?: string) {
    const p = (party || "").toLowerCase();
    const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium border";
    if (p.startsWith("dem")) return base + " border-blue-500 text-blue-700";
    if (p.startsWith("rep")) return base + " border-red-500 text-red-700";
    return base + " border-gray-400 text-gray-700";
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">NH Rep Finder</h1>

        <div className="mt-4 flex gap-2">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addr.trim().length > 5 && !loading && onSearch()}
            placeholder="Enter an address (e.g., 667 NH RT 120, Cornish, NH)"
            className="w-full rounded-2xl border border-neutral-300 bg-white p-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onSearch}
            disabled={addr.trim().length <= 5 || loading}
            className={cls(
              "rounded-2xl px-4 py-3 font-medium",
              addr.trim().length > 5 && !loading
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-neutral-300 text-neutral-600 cursor-not-allowed"
            )}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {baseDistrict && (
          <div className="mt-4 text-sm text-neutral-600">
            Base district: <span className="font-medium">{baseDistrict}</span>
          </div>
        )}

        <div className="mt-6 grid gap-4">
          {reps.map((r) => {
            const key = r.name + "|" + r.district;
            const myVotes = votes[key] || [];
            const isFloterial =
              baseDistrict && r.district && r.district.trim() !== baseDistrict.trim();

            return (
              <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{r.name}</div>
                    <div className="text-sm text-neutral-600">{r.district}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={partyPill(r.party)}>{r.party}</span>
                    {isFloterial && (
                      <span className="inline-block rounded-full border border-amber-500 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Floterial
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {r.email && (
                    <a
                      href={`mailto:${r.email}`}
                      className="rounded-full border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
                    >
                      {r.email}
                    </a>
                  )}
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="rounded-full border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
                    >
                      {r.phone}
                    </a>
                  )}
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium text-neutral-700">Key votes</div>
                  {myVotes.length === 0 ? (
                    <div className="mt-1 text-sm text-neutral-500">
                      {loading ? "Loading…" : "No key votes found for this member."}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {myVotes.map((v, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-1 text-sm"
                          title={v.bill}
                        >
                          {v.bill}: <span className="font-medium">{v.vote}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
