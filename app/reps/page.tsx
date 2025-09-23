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

// Accept both shapes: flat and nested under `data`
type LookupPayload =
  | {
      success?: boolean;
      data?: {
        address?: string;
        geographies?: { town_county?: [string, string]; sldl?: string | null };
        source?: { geocoder?: string; openstates_geo_used?: boolean; overlay_labels?: string[] };
        stateRepresentatives?: Rep[];
      };
      error?: string;
    }
  | {
      success?: boolean;
      address?: string;
      geographies?: { town_county?: [string, string]; sldl?: string | null };
      source?: { geocoder?: string; openstates_geo_used?: boolean; overlay_labels?: string[] };
      stateRepresentatives?: Rep[];
      error?: string;
    };

// Normalized view for rendering
type View = {
  address?: string;
  geographies?: { town_county?: [string, string]; sldl?: string | null };
  source?: { geocoder?: string; openstates_geo_used?: boolean; overlay_labels?: string[] };
  stateRepresentatives?: Rep[];
};

const RAW =
  (process.env.NEXT_PUBLIC_BACKEND_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "").trim();
const API_BASE =
  RAW.replace(/\/+$/,"") || "https://nh-rep-finder-api-staging.onrender.com";

export default function RepsPage() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function lookup(address: string) {
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const url = `${API_BASE}/api/lookup-legislators?address=${encodeURIComponent(address)}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as LookupPayload;

      // success flag (default true if missing)
      const ok = "success" in payload ? Boolean((payload as any).success) : res.
