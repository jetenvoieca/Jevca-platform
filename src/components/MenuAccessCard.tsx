"use client";

import { useState, useTransition } from "react";
import { setArtistMenuAccess } from "@/lib/actions/users";
import { SITE_MENU } from "@/lib/siteMenuAccess";
import type { SiteNavKey } from "@/lib/siteNav";

// What the client's login may reach (2026-10-26), on Administration →
// Clients: the site menu's items, ticked, applying to all their sites.
// Each tick saves at once. Administration and Templates are never
// offered.
export default function MenuAccessCard({
  artistId,
  initial,
  className = "",
}: {
  artistId: string;
  initial: SiteNavKey[];
  className?: string;
}) {
  const [ticked, setTicked] = useState(new Set(initial));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = (next: Set<SiteNavKey>) => {
    const before = ticked;
    setTicked(next);
    setError(null);
    startTransition(async () => {
      const result = await setArtistMenuAccess(artistId, [...next]);
      if ("error" in result) {
        setError(result.error);
        setTicked(before);
      }
    });
  };
  const toggle = (keys: SiteNavKey[], on: boolean) => {
    const next = new Set(ticked);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    save(next);
  };

  return (
    <div className={`rounded-md border border-neutral-200 p-3 ${className}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        What they can reach
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {SITE_MENU.map((section) => {
          const keys = section.items.map((i) => i.key);
          const all = keys.every((k) => ticked.has(k));
          return (
            <div key={section.section}>
              <label className="mb-1 flex items-center gap-2 text-sm font-medium text-neutral-800">
                <input
                  type="checkbox"
                  checked={all}
                  disabled={isPending}
                  onChange={(e) => toggle(keys, e.target.checked)}
                />
                {section.section}
              </label>
              {section.items.length > 1 &&
                section.items.map((item) => (
                  <label
                    key={item.key}
                    className="ml-5 flex items-center gap-2 text-sm text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      checked={ticked.has(item.key)}
                      disabled={isPending}
                      onChange={(e) => toggle([item.key], e.target.checked)}
                    />
                    {item.label}
                  </label>
                ))}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-3 text-xs text-neutral-400">
        For all their sites. Administration and Templates are never available to
        them.
      </p>
    </div>
  );
}
