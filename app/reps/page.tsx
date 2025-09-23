"use client";

import React, { useState } from "react";

// ---------- Types ----------
type Rep = {
  id?: string;
  name: string;
  party?: string;
  district?: string;
  email?: string | null;
  phone?: string | null;
  links?: { url: string }[];
  votes?: { bill: string; vote: string }[];
};

type Geo = { town_county?: [string, string]; sldl?: string | null };

type LookupPayload =
  | {
      success?: boolean;
      data?: {
        address?: string;
        geographies?: Geo;
        source?: { geocoder?: string; openstates_geo_used?: boolean; overlay_labels?: string[] };
        stateRepresentatives?: Rep[];
      };
      error?: string;
    }
  | {
      success?: boolean;
      address?: string;
      geographies?: Geo;
      source?: { geocoder?: string; openstates_geo_used?: boolean; overlay_labels?: string[] };
      stateRepresentatives?: Rep[];
      error?: string;
    };

// ---------- ENV (accept either var), normalize ----------
const RAW =
  (process.env.NEXT_PUBLIC_BACKEND_BASE ??
    process.env.NEXT_PUBLIC_API_BASE ??
    "").trim();
const API_BASE =
  RAW.replace(/\/+$/, "") ||
  "https://nh-rep-finder-api-staging.onrender.com"; // safe default

// ---------- Helpers ----------
async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function fetchLookup(address: string) {
  const url = `${API_BASE}/api/lookup-legislators?address=${encodeURIComponent(
    address
  )}`;
  const payload = (await fetchJSON(url)) as LookupPayload;
  const ok =
    "success" in payload ? Boolean((payload as any).success) : true;
  if (!ok) throw new Error((payload as any)?.error || "lookup_failed");
  const flat: any = (payload as any).data ? (payload as any).data : payload;
  return {
    address: flat.address as string | undefined,
    geographies: flat.geographies as Geo | undefined,
    reps: (flat.stateRepresentatives || []) as Rep[],
  };
}

async function fetchVotesForRep(r: Rep) {
  const qs = new URLSearchParams({
    person_id: r.id || "",
    name: r.name || "",
    district: r.district || "",
  });
  const url = `${API_BASE}/api/key-votes?${qs.toString()}`;
  const payload = await fetchJSON(url);
  const votes: { bill: string; vote: string }[] =
    payload?.data?.votes || [];
  return { ...r, votes };
}

// ---------- Page ----------
export default function RepsPage() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [geo, setGeo] = useState<Geo | undefined>(undefined);
  const [reps, setReps] = useState<Rep[]>([]);

  async function lookup(address: string) {
    setLoading(true);
    setErr(null);
    setReps([]);
    setAddress(undefined);
    setGeo(undefined);
    try {
      // 1) reps
      const { address: a, geographies, reps } = await fetchLookup(address);
      setAddress(a);
      setGeo(geographies);

      // 2) attach votes (in parallel, but keep order)
      const withVotes = await Promise.all(reps.map(fetchVotesForRep));
      setReps(withVotes);
    } catch (e: any) {
      setErr(e?.message || "lookup_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Find Your NH State Reps</h1>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (addr.trim()) lookup(addr.trim());
        }}
      >
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Enter your address (e.g., 667 NH RT 120, Cornish, NH)"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
        />
        <button type="submit" className="border rounded px-4 py-2" disabled={loading}>
          {loading ? "Looking…" : "Search"}
        </button>
      </form>

      {/* Show which API we’re hitting */}
      <div className="text-xs text-gray-500">API: {API_BASE}</div>

      {err && <div className="text-red-600">Error: {err}</div>}

      {(address || geo) && (
        <div className="text-sm text-gray-700 space-y-1">
          <div>
            <span className="font-medium">Address:</span> {address || "—"}
          </div>
          <div>
            <span className="font-medium">Town/County:</span>{" "}
            {geo?.town_county?.join(", ") || "—"}
          </div>
          <div>
            <span className="font-medium">Base SLDL:</span>{" "}
            {geo?.sldl ?? "—"}
          </div>
        </div>
      )}

      {reps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold mt-4">Representatives</h2>
          <ul className="divide-y border rounded">
            {reps.map((r, i) => (
              <li key={r.id || `${r.name}-${i}`} className="p-3 space-y-1">
                <div className="font-medium">
                  {r.name}
                  {r.party ? ` (${r.party})` : ""}
                </div>
                <div className="text-sm text-gray-700">
                  District: {r.district || "—"}
                </div>
                <div className="text-sm">
                  {r.email && (
                    <>
                      Email:{" "}
                      <a className="underline" href={`mailto:${r.email}`}>
                        {r.email}
                      </a>
                    </>
                  )}
                  {r.phone && (
                    <>
                      {" "}| Phone: <a href={`tel:${r.phone}`}>{r.phone}</a>
                    </>
                  )}
                </div>

                {/* Votes */}
                <div className="mt-2">
                  <div className="text-sm font-semibold">Key Votes</div>
                  {!r.votes || r.votes.length === 0 ? (
                    <div className="text-xs text-gray-500">No votes matched (check CSV source).</div>
                  ) : (
                    <ul className="list-disc ml-5 text-sm">
                      {r.votes.map((v, idx) => (
                        <li key={idx}>
                          <span className="font-mono">{v.bill}</span>: {v.vote}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
