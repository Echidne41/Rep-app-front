"use client";

import React from "react";

// read env (either name), strip trailing slashes, hard-fallback to staging API
const RAW = (process.env.NEXT_PUBLIC_BACKEND_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "").trim();
const API_BASE = RAW.replace(/\/+$/,"") || "https://nh-rep-finder-api-staging.onrender.com";

export default function RepsTestPage() {
  const [status, setStatus] = React.useState("Waiting…");
  const [msg, setMsg] = React.useState<string>("");

  async function ping() {
    setStatus("Pinging /health…");
    setMsg("");
    try {
      const r = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      const j = await r.json();
      setStatus(`OK ${r.status}`);
      setMsg(JSON.stringify({ api: API_BASE, ok: j.ok, has_key: j.has_openstates_key, floterial_counts: [j?.floterial_base_csv_set, j?.floterial_town_csv_set] }, null, 2));
    } catch (e: any) {
      setStatus("ERROR");
      setMsg(`${API_BASE}\n${e?.message || e}`);
    }
  }

  return (
    <main style={{maxWidth: 800, margin: "40px auto", fontFamily: "system-ui"}}>
      <h1>NH Rep Finder — Frontend Ping</h1>
      <p>API base I see at build time:</p>
      <pre style={{background:"#111",color:"#0f0",padding:8,borderRadius:8}}>{API_BASE || "(empty)"}</pre>
      <button onClick={ping} style={{padding:"8px 12px", border:"1px solid #888", borderRadius:6}}>Test /health</button>
      <p><strong>Status:</strong> {status}</p>
      {msg && <pre style={{background:"#f6f8fa",padding:8,borderRadius:8,whiteSpace:"pre-wrap"}}>{msg}</pre>}
      <hr style={{margin:"24px 0"}} />
      <p>If this page loads and /health works, the crash is in the big page’s code. Then we swap back.</p>
    </main>
  );
}
