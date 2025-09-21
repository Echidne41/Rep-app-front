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

type LookupResponse = {
  success: boolean;
  address?: string;
  geographies?: { town_county?: [string, string]; sldl?: string | null };
  source?: {
    geocoder?: string;
    openstates_geo_used?: boolean;
    overlay_labels?: string[];
  };
  stateRepresentatives?: Rep[];
  error?: string;
};

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE || "";

export default function RepsPage() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LookupResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function lookup(address: string) {
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const u = new URL("/api/lookup-legislators", BACKEND);
      u.searchParams.set("address", address);
      const res = await fetch(u.toString(), { cache: "no-store" });
      const json = (await res.json()) as LookupResponse;
      if (!json.success) throw new Error(json.error || "lookup_failed");
      setData(json);
    } catch (e: any) {
      setErr(e.message || "lookup_failed");
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
        <button
          type="submit"
          className="border rounded px-4 py-2"
          disabled={loading}
        >
          {loading ? "Looking…" : "Search"}
        </button>
      </form>

      {err && <div className="text-red-600">Error: {err}</div>}

      {data && (
        <section className="space-y-2">
          <div className="text-sm text-gray-700">
            <div>
              <span className="font-medium">Address:</span>{" "}
              {data.address || "—"}
            </div>
            <div>
              <span className="font-medium">Town/County:</span>{" "}
              {data.geographies?.town_county?.join(", ") || "—"}
            </div>
            <div>
              <span className="font-medium">Base SLDL:</span>{" "}
              {data.geographies?.sldl ?? "—"}
            </div>
          </div>

          <h2 className="text-xl font-semibold mt-4">Representatives</h2>
          <ul className="divide-y border rounded">
            {(data.stateRepresentatives || []).map((r, i) => (
              <li key={r.id || `${r.name}-${i}`} className="p-3">
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
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
