"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";

type TemplateRow = {
  id: string;
  name: string;
  pageCount: number;
  updatedAt: string;
};

const SEARCH_DEBOUNCE_MS = 300;

export default function TemplatesListColumn({
  templates,
  q,
  selectedId = null,
}: {
  templates: TemplateRow[];
  q: string;
  selectedId?: string | null;
}) {
  const router = useRouter();

  // Same debounced search-as-you-type pattern as SitesListColumn — the
  // "q" URL param drives the server-side filter in
  // src/app/templates/page.tsx.
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const queryString = params.toString();
      router.replace(queryString ? `/templates?${queryString}` : "/templates");
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 pb-3 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Templates</h2>
          <Link
            href="/templates/new"
            className="text-xs font-medium text-neutral-900 hover:underline"
          >
            + Add New
          </Link>
        </div>

        <input
          type="text"
          name="q"
          defaultValue={q}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search templates"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
        />

        <p className="mt-2 text-[11px] text-neutral-400">
          {templates.length} template{templates.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {templates.length === 0 ? (
          <p className="p-4 text-xs text-neutral-500">No templates match.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {templates.map((t) => {
              const active = t.id === selectedId;
              return (
                <li key={t.id}>
                  <Link
                    href={`/templates/${t.id}`}
                    prefetch={false}
                    className={`flex items-center justify-between gap-2 px-4 py-2 text-xs text-neutral-800 ${
                      active ? "bg-[#E7E7E7]" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0 truncate font-medium">{t.name}</span>
                    <span className="shrink-0 text-[10px] text-neutral-400">
                      {t.pageCount} page{t.pageCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
