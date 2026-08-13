"use client";

import { useState, useEffect, useRef } from "react";
import { searchCustomers, type CustomerSummary } from "@/lib/actions/customers";

// Search-or-create-inline (2026-08-13 decision) — this only ever
// searches and selects. Typing a name/email that doesn't match anything
// isn't handled here at all; the fields below it stay exactly as free
// text, and the server (findOrCreateCustomer) creates a new Customer
// automatically the moment the sale is actually started. So "create" is
// really just "don't select anything" — nothing extra to build for it.
export default function CustomerPicker({
  artistId,
  onSelect,
}: {
  artistId: string;
  onSelect: (customer: CustomerSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const rows = await searchCustomers(artistId, query);
      setResults(rows);
      setOpen(rows.length > 0);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, artistId]);

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-neutral-700">Customer</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search an existing customer, or type new details below"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // fires before the input's onBlur closes the list
              onClick={() => {
                onSelect(c);
                setQuery(c.name);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <span className="font-medium text-neutral-900">{c.name}</span>
              {c.email && <span className="ml-2 text-neutral-400">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
