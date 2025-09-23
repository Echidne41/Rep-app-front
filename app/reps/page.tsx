"use client";

import React, { useState } from "react";

type Rep = {
  id?: string;
  name: string;
  party?: string;
  district?: string;
  email?: string | null;
  phone?: string | null;
  links?: { url: string }[];
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

// ENV (accept either var), normalize trailing slash
const RAW =
  (process.env.NEXT_PUBLIC_BACKEND_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "").trim();
const API_BASE = RAW.replace(/\/+$/, "") || "https://nh-rep-finder-api-staging.onrender.com";

export default function RepsPage() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<{
    address?: string;
    geographies?: Geo;
    stateRepresentatives?: Rep[];
  } | null>(null);

  async function lookup(address: string) {
    setLoading(true);
    setErr(null);
    setView(null);
    try {
      const url = `${API_BASE}/api/lookup-legislators?address=${encodeURIComponent(address)}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as LookupPayload;

      const ok = "success" in payload ? Boolean((payload as any).success) : res.ok;
      if (!ok) {
        const msg = (payload as any)?.error || `lookup_failed (${res.status})`;
        throw new Error(msg);
      }

      const flat: any = (payload as any).data ? (payload as any).data : payload;
      setView({
        address: flat.address,
        geographies: flat.geographies,
        stateRepresentatives: flat.stateRepresentatives || [],
      });
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

      <div className="text-xs text-gray-500">API: {API_BASE}</div>

      {err && <div className="text-red-600">Error: {err}</div>}

      {view && (
        <section className="space-y-2">
          <div className="text-sm text-gray-700">
            <div>
              <span className="font-medium">Address:</span> {view.address || "—"}
            </div>
            <div>
              <span className="font-medium">Town/County:</span>{" "}
              {view.geographies?.town_county?.join(", ") || "—"}
            </div>
            <div>
              <span className="font-medium">Base SLDL:</span>{" "}
              {view.geographies?.sldl ?? "—"}
            </div>
          </div>

          <h2 className="text-xl font-semibold mt-4">Representatives</h2>
          <ul className="divide-y border rounded">
            {(view.stateRepresentatives || []).map((r, i) => (
              <li key={r.id || `${r.name}-${i}`} className="p-3">
                <div className="font-medium">
                  {r.name}
                  {r.party ? ` (${r.party})` : ""}
                </div>
                <div className="text-sm text-gray-700">District: {r.district || "—"}</div>
                <div className="text-sm">
                  {r.email && (
                    <>
                      Email: <a className="underline" href={`mailto:${r.email}`}>{r.email}</a>
                    </>
                  )}
                  {r.phone && (
                    <>
                      {" "}| Phone: <a href={`tel:${r.phone}`}>{r.phone}</a>
                    </>
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
