/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
export default function Home() {
  return (
    <main style={{maxWidth:780,margin:"2rem auto",fontFamily:"system-ui"}}>
      <h1 style={{fontSize:32,fontWeight:800,marginBottom:12}}>NH Rep Finder</h1>
      <p style={{color:"#555",marginBottom:16}}>
        Use the tool at <a href="/reps">/reps</a> to look up representatives and key votes.
      </p>
      <a href="/reps" style={{display:"inline-block",padding:"10px 14px",borderRadius:12,background:"#1E63FF",color:"#fff",textDecoration:"none"}}>
        Go to /reps
      </a>
    </main>
  );
}
