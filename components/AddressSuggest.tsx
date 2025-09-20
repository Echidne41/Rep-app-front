'use client';

import React, { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
};

const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function AddressSuggest({ value, onChange, onSelect, onEnter, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function fetchSuggestions(q: string) {
    if (!MAPBOX || q.trim().length < 3) { setItems([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?autocomplete=true&country=us&language=en&limit=5&types=address,place,locality,region,postcode&access_token=${MAPBOX}`;
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const names: string[] = (j.features || []).map((f: any) => f.place_name).filter(Boolean);
      setItems(names); setOpen(names.length > 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  function onInputChange(v: string) {
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 200);
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        aria-label="Enter your address"
        value={value}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
        className="w-full border rounded-lg px-3 py-2"
        placeholder={placeholder || 'Enter your address'}
        autoComplete="off"
      />
      {open && (
        <div role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white shadow">
          {loading && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
          {!loading && items.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>}
          {items.map((s, i) => (
            <button
              role="option"
              key={i}
              onClick={() => { onSelect(s); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
