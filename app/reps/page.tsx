<<<<<<< HEAD
<<<<<<< HEAD
"use client";
import { useState } from "react";

type Vote = { bill: string; vote: string };
type RawVoteMap = Record<string, string | number | null | undefined>;

type Rep = {
  id?: string;
  name: string;
  party?: string;
  district?: string;
  email?: string;
  votes?: Vote[] | RawVoteMap; // array or object map
};

type Data = {
  formattedAddress?: string;
  geographies?: { sldl?: { name?: string } };
  stateRepresentatives: Rep[];
};

// Normalize votes to a list of {bill, vote}
function toVotes(raw: Rep["votes"] | any): Vote[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Vote[];
  if (typeof raw === "object") {
    return Object.entries(raw as RawVoteMap).map(([bill, vote]) => ({
      bill,
      vote: String(vote ?? "").trim(),
    }));
  }
  return [];
}

export default function RepsPage() {
  const [addr, setAddr] = useState("667 NH RT 120, Cornish, NH");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000";
      const url = `${base}/api/lookup-with-votes?address=${encodeURIComponent(
        addr
      )}&refreshVotes=1&ts=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || j?.success === false) {
        throw new Error(j?.error?.message || `HTTP ${res.status}`);
      }
      setData(j.data as Data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 36, fontWeight: 800 }}>NH Rep Finder</h1>

      <div style={{ display: "flex", gap: 12 }}>
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Enter a NH address"
          style={{
            flex: 1,
            padding: "12px 14px",
            fontSize: 18,
            border: "1px solid #d0d0d0",
            borderRadius: 10,
          }}
        />
        <button
          onClick={lookup}
          disabled={loading}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "#1E63FF",
            color: "#fff",
            border: "none",
            fontSize: 16,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Loading…" : "Search"}
        </button>
      </div>

      <div style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
        API base: {process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000"}
      </div>

      {error && <pre style={{ color: "crimson", marginTop: 12 }}>{error}</pre>}

      {data && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: "#666" }}>{data.formattedAddress}</div>
          <div style={{ color: "#666", marginBottom: 12 }}>
            Base district: {data.geographies?.sldl?.name || "—"}
          </div>

          {Array.isArray(data.stateRepresentatives) &&
            data.stateRepresentatives.map((r) => {
              const votes = toVotes(
                (r as any).votes ?? (r as any).key_votes ?? (r as any).vote_map
              ).filter((v) => v.bill && String(v.vote ?? "").trim().length > 0);

              return (
                <div
                  key={r.id || r.name}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 14,
                    padding: 16,
                    marginTop: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{r.name}</div>
                      <div style={{ color: "#555" }}>{r.district}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {r.party && (
                        <span
                          style={{
                            border: "1px solid #c7d7ff",
                            color: "#1E63FF",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 13,
                          }}
                        >
                          {r.party}
                        </span>
                      )}
                      {/* Floterial tag removed by request */}
                    </div>
                  </div>

                  {r.email && (
                    <div style={{ marginTop: 10 }}>
                      <a
                        href={`mailto:${r.email}`}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          padding: "6px 12px",
                          textDecoration: "none",
                          color: "#222",
                        }}
                      >
                        {r.email}
                      </a>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <b>Key votes ({votes.length})</b>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      {votes.length ? (
                        votes.slice(0, 24).map((v, i) => (
                          <span
                            key={`${v.bill}-${i}`}
                            style={{
                              border: "1px solid #ccc",
                              borderRadius: 999,
                              padding: "4px 10px",
                              fontSize: 13,
                            }}
                          >
                            {v.bill}: {v.vote}
                          </span>
                        ))
                      ) : (
                        <i>No key votes found.</i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
=======
=======
/* eslint-disable @typescript-eslint/no-explicit-any */


>>>>>>> 359e29b (build: disable no-explicit-any for deploy)
"use client";
import { useState } from "react";

type Vote = { bill: string; vote: string };
type RawVoteMap = Record<string, string | number | null | undefined>;

type Rep = {
  id?: string;
  name: string;
  party?: string;
  district?: string;
  email?: string;
  votes?: Vote[] | RawVoteMap; // array or object map
};

type Data = {
  formattedAddress?: string;
  geographies?: { sldl?: { name?: string } };
  stateRepresentatives: Rep[];
};

// Normalize votes to a list of {bill, vote}
function toVotes(raw: Rep["votes"] | any): Vote[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Vote[];
  if (typeof raw === "object") {
    return Object.entries(raw as RawVoteMap).map(([bill, vote]) => ({
      bill,
      vote: String(vote ?? "").trim(),
    }));
  }
  return [];
}

export default function RepsPage() {
  const [addr, setAddr] = useState("667 NH RT 120, Cornish, NH");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000";
      const url = `${base}/api/lookup-with-votes?address=${encodeURIComponent(
        addr
      )}&refreshVotes=1&ts=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || j?.success === false) {
        throw new Error(j?.error?.message || `HTTP ${res.status}`);
      }
      setData(j.data as Data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 36, fontWeight: 800 }}>NH Rep Finder</h1>

      <div style={{ display: "flex", gap: 12 }}>
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Enter a NH address"
          style={{
            flex: 1,
            padding: "12px 14px",
            fontSize: 18,
            border: "1px solid #d0d0d0",
            borderRadius: 10,
          }}
        />
        <button
          onClick={lookup}
          disabled={loading}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "#1E63FF",
            color: "#fff",
            border: "none",
            fontSize: 16,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Loading…" : "Search"}
        </button>
      </div>

      <div style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
        API base: {process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000"}
      </div>

      {error && <pre style={{ color: "crimson", marginTop: 12 }}>{error}</pre>}

      {data && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: "#666" }}>{data.formattedAddress}</div>
          <div style={{ color: "#666", marginBottom: 12 }}>
            Base district: {data.geographies?.sldl?.name || "—"}
          </div>

          {Array.isArray(data.stateRepresentatives) &&
            data.stateRepresentatives.map((r) => {
              const votes = toVotes(
                (r as any).votes ?? (r as any).key_votes ?? (r as any).vote_map
              ).filter((v) => v.bill && String(v.vote ?? "").trim().length > 0);

              return (
                <div
                  key={r.id || r.name}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 14,
                    padding: 16,
                    marginTop: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{r.name}</div>
                      <div style={{ color: "#555" }}>{r.district}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {r.party && (
                        <span
                          style={{
                            border: "1px solid #c7d7ff",
                            color: "#1E63FF",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 13,
                          }}
                        >
                          {r.party}
                        </span>
                      )}
                      {/* Floterial tag removed by request */}
                    </div>
                  </div>

                  {r.email && (
                    <div style={{ marginTop: 10 }}>
                      <a
                        href={`mailto:${r.email}`}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 999,
                          padding: "6px 12px",
                          textDecoration: "none",
                          color: "#222",
                        }}
                      >
                        {r.email}
                      </a>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <b>Key votes ({votes.length})</b>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      {votes.length ? (
                        votes.slice(0, 24).map((v, i) => (
                          <span
                            key={`${v.bill}-${i}`}
                            style={{
                              border: "1px solid #ccc",
                              borderRadius: 999,
                              padding: "4px 10px",
                              fontSize: 13,
                            }}
                          >
                            {v.bill}: {v.vote}
                          </span>
                        ))
                      ) : (
                        <i>No key votes found.</i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
>>>>>>> 65c75a5 (initial commit)
