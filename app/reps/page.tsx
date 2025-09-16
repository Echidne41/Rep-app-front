/* eslint-disable @typescript-eslint/no-explicit-any */
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
  votes?: Vote[] | RawVoteMap;
};
type Data = {
  formattedAddress?: string;
  geographies?: { sldl?: { name?: string } };
  stateRepresentatives: Rep[] | Record<string, Rep>;
};

function toVotes(raw: any): Vote[] {
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
    setLoading(true); setError(null); setData(null);
    try {
      const base = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000").replace(/\/+$/,'');
      const url  = `${base}/api/lookup-with-votes?address=${encodeURIComponent(addr)}&refreshVotes=1&ts=${Date.now()}`;
      const res  = await fetch(url, { cache: "no-store" });
      const j    = await res.json();
      if (!res.ok || j?.success === false) throw new Error(j?.error?.message || `HTTP ${res.status}`);
      setData(j.data as Data);
    } catch (e:any) { setError(e.message || "Failed to fetch"); }
    finally { setLoading(false); }
  }

  const reps: Rep[] = data
    ? (Array.isArray(data.stateRepresentatives)
        ? data.stateRepresentatives
        : Object.values(data.stateRepresentatives || {}))
    : [];

  return (
    <div className="wrap">
      <h1 className="h1">NH Rep Finder</h1>

      <div className="bar">
        <input
          className="inp"
          value={addr}
          onChange={(e)=>setAddr(e.target.value)}
          onKeyDown={(e)=>e.key==="Enter" && lookup()}
          placeholder="Enter a NH address"
        />
        <button className="btn" onClick={lookup} disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </button>
      </div>

      <div className="hint">API base: {process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5000"}</div>
      {error && <pre className="err">{error}</pre>}

      {data && (
        <div className="results">
          <div className="meta">{data.formattedAddress}</div>
          <div className="meta">Base district: {data.geographies?.sldl?.name || "—"}</div>
          <div className="meta small">
            Reps found: <b>{reps.length}</b>
            {reps.length ? ` — ${reps.map(r => `${r.name} (${r.district})`).join(", ")}` : ""}
          </div>

          {reps.map((r) => {
            const votes = toVotes((r as any).votes ?? (r as any).key_votes ?? (r as any).vote_map)
              .filter((v) => v.bill && String(v.vote ?? "").trim().length > 0);

            const party = (r.party || "").toLowerCase();
            const partyStyle = party.includes("rep")
              ? { borderColor:"#ffb3b3", color:"#a40000", background:"#ffecec" }   // red for Republicans
              : party.includes("dem")
              ? { borderColor:"#c7d7ff", color:"#1E63FF", background:"#eef4ff" }
              : { borderColor:"#ddd", color:"#444", background:"#f7f7f7" };

            return (
              <div key={`${r.id || r.name}-${r.district || ""}`} className="card">
                <div className="row">
                  <div>
                    <div className="name">{r.name}</div>
                    <div className="dist">{r.district}</div>
                  </div>
                  <div className="tags">
                    {r.party && <span className="chip" style={partyStyle}>{r.party}</span>}
                  </div>
                </div>

                {r.email && (
                  <div className="email">
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                  </div>
                )}

                <div className="votes">
                  <b>Key votes ({votes.length})</b>
                  <div className="chips">
                    {votes.length ? (
                      votes.slice(0,24).map((v,i)=>(
                        <span key={`${v.bill}-${i}`} className="pill">{v.bill}: {v.vote}</span>
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

      <style jsx>{`
        .wrap { max-width:780px; margin:2rem auto; padding:0 12px; font-family:system-ui; }
        .h1 { font-size:32px; font-weight:800; margin:0 0 12px; }
        .bar { display:flex; gap:12px; }
        .inp { flex:1; padding:12px 14px; font-size:18px; border:1px solid #d0d0d0; border-radius:10px; }
        .btn { padding:12px 18px; border-radius:12px; background:#1E63FF; color:#fff; border:none; font-size:16px; }
        .btn:disabled { opacity:.7; }
        .hint { color:#888; font-size:12px; margin-top:8px; }
        .err { color:crimson; margin-top:12px; white-space:pre-wrap; }
        .results { margin-top:16px; }
        .meta { color:#666; margin-bottom:6px; }
        .meta.small { font-size:13px; color:#444; }
        .card { border:1px solid #e5e5e5; border-radius:14px; padding:16px; margin-top:16px; }
        .row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .name { font-size:22px; font-weight:700; }
        .dist { color:#555; }
        .tags { display:flex; gap:8px; align-items:center; }
        .chip { border:1px solid #ddd; border-radius:999px; padding:4px 10px; font-size:13px; background:#f7f7f7; }
        .email a { display:inline-block; border:1px solid #ddd; border-radius:999px; padding:6px 12px; text-decoration:none; color:#222; margin-top:10px; }
        .votes { margin-top:12px; }
        .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
        .pill { border:1px solid #ccc; border-radius:999px; padding:4px 10px; font-size:13px; }
        @media (max-width:640px) {
          .bar { flex-direction:column; }
          .btn { width:100%; }
          .row { flex-direction:column; align-items:flex-start; }
          .email a { width:100%; text-align:center; }
        }
      `}</style>
    </div>
  );
}
