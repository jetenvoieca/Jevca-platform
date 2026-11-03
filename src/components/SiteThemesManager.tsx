"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSiteTheme, deleteSiteTheme, updateSiteTheme } from "@/lib/actions/siteThemes";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { MenuStyleSummary } from "@/lib/actions/menuStyles";
import {
  MAX_THEME_ENTRIES,
  MAX_THEME_TITLE,
  type SiteThemeEntry,
  type SiteThemeEntryKind,
  type SiteThemeSummary,
} from "@/lib/siteThemes";
import { ThemedStyleOptions } from "@/components/ThemedStyleList";
import ConfirmDialog from "@/components/ConfirmDialog";

// Templates → Site Themes (2026-11-03, Craig's request — see
// lib/siteThemes.ts): the list of themes on the right with New and
// Delete; the chosen theme on the left — its name, the site menu it sets,
// and its pages in menu order: each a page (name, Display Style, own menu,
// the page it sits under), a page for each curation, or the Contact panel
// page. Pages are moved with ↑ ↓ and taken out with ✕. Save keeps the
// changes; a theme is used with the Theme button on a site's Pages page.

const KIND_LABEL: Record<SiteThemeEntryKind, string> = {
  PAGE: "Page",
  CURATIONS: "A page for each curation",
  CONTACT: "Contact panel",
};

type Draft = { name: string; siteMenuStyleId: string | null; entries: SiteThemeEntry[] };

const draftOf = (t: SiteThemeSummary): Draft => ({
  name: t.name,
  siteMenuStyleId: t.siteMenuStyleId,
  entries: t.entries,
});

export default function SiteThemesManager({
  themes,
  pageStyles,
  menuStyles,
}: {
  themes: SiteThemeSummary[];
  pageStyles: PageStyleSummary[];
  menuStyles: MenuStyleSummary[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(themes[0]?.id ?? null);
  const selected = themes.find((t) => t.id === selectedId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(selected ? draftOf(selected) : null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const blockBuild = pageStyles.filter((s) => s.type === "BLOCK_BUILD");

  const select = (theme: SiteThemeSummary) => {
    setSelectedId(theme.id);
    setDraft(draftOf(theme));
    setError(null);
    setSaved(false);
  };

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSaved(false);
  };
  const changeEntry = (id: string, patch: Partial<SiteThemeEntry>) =>
    draft && change({ entries: draft.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const move = (index: number, by: -1 | 1) => {
    if (!draft) return;
    const next = [...draft.entries];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    change({ entries: next });
  };
  const remove = (id: string) =>
    draft &&
    change({
      entries: draft.entries
        .filter((e) => e.id !== id)
        .map((e) => (e.parentEntryId === id ? { ...e, parentEntryId: null } : e)),
    });
  const add = (kind: SiteThemeEntryKind) =>
    draft &&
    change({
      entries: [
        ...draft.entries,
        {
          id: crypto.randomUUID(),
          kind,
          title: kind === "CONTACT" ? "contact" : kind === "PAGE" ? "new page" : "",
          pageStyleId: null,
          menuStyleId: null,
          parentEntryId: null,
        },
      ],
    });

  const save = () => {
    if (!selected || !draft) return;
    setError(null);
    startTransition(async () => {
      const result = await updateSiteTheme(selected.id, draft);
      if ("error" in result) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  };

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSiteTheme(newName);
      if ("error" in result) return setError(result.error);
      setNewName("");
      setSelectedId(result.id);
      setDraft({ name: newName.trim(), siteMenuStyleId: null, entries: [] });
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmingDelete(false);
    startTransition(async () => {
      await deleteSiteTheme(selected.id);
      setSelectedId(null);
      setDraft(null);
      router.refresh();
    });
  };

  const field = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <div className="grid h-full grid-cols-[1fr_280px] gap-4 p-4">
      <section className="min-h-0 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-5">
        {!draft || !selected ? (
          <p className="text-sm text-neutral-400">Choose a theme, or make a new one.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-3">
              <label className="text-sm text-neutral-700">Name</label>
              <input value={draft.name} onChange={(e) => change({ name: e.target.value })} className={field} />
              <label className="text-sm text-neutral-700">Site menu</label>
              <select
                value={draft.siteMenuStyleId ?? ""}
                onChange={(e) => change({ siteMenuStyleId: e.target.value || null })}
                className={field}
              >
                <option value="">None</option>
                <ThemedStyleOptions items={menuStyles} />
              </select>
            </div>

            <div>
              <h2 className="mb-2 text-base font-medium text-neutral-900">Pages, in menu order</h2>
              {draft.entries.length === 0 && <p className="mb-2 text-sm text-neutral-400">No pages yet — add them below.</p>}
              <div className="flex flex-col gap-2">
                {draft.entries.map((e, i) => {
                  const parents = draft.entries.slice(0, i).filter((p) => p.kind === "PAGE" && !p.parentEntryId);
                  return (
                    <div
                      key={e.id}
                      className={`grid grid-cols-[150px_1fr_1fr_1fr_1fr_auto] items-center gap-2 rounded-md border border-neutral-200 p-2 ${
                        e.parentEntryId ? "ml-6" : ""
                      }`}
                    >
                      <span className="text-xs uppercase tracking-wide text-neutral-500">{KIND_LABEL[e.kind]}</span>
                      {e.kind === "CURATIONS" ? (
                        <span className="text-sm text-neutral-400">Named after each curation</span>
                      ) : (
                        <input
                          value={e.title}
                          maxLength={MAX_THEME_TITLE}
                          onChange={(ev) => changeEntry(e.id, { title: ev.target.value })}
                          aria-label="Page name"
                          placeholder="Page name"
                          className={field}
                        />
                      )}
                      {e.kind === "CONTACT" ? (
                        <span className="text-sm text-neutral-400">Over the current page</span>
                      ) : (
                        <select
                          value={e.pageStyleId ?? ""}
                          onChange={(ev) => changeEntry(e.id, { pageStyleId: ev.target.value || null })}
                          aria-label="Display Style"
                          className={field}
                        >
                          <option value="">No Display Style</option>
                          <ThemedStyleOptions items={blockBuild} />
                        </select>
                      )}
                      {e.kind === "CONTACT" ? (
                        <span />
                      ) : (
                        <select
                          value={e.menuStyleId ?? ""}
                          onChange={(ev) => changeEntry(e.id, { menuStyleId: ev.target.value || null })}
                          aria-label="Menu"
                          className={field}
                        >
                          <option value="">Site menu</option>
                          <ThemedStyleOptions items={menuStyles} />
                        </select>
                      )}
                      {e.kind === "CONTACT" ? (
                        <span />
                      ) : (
                        <select
                          value={e.parentEntryId ?? ""}
                          onChange={(ev) => changeEntry(e.id, { parentEntryId: ev.target.value || null })}
                          aria-label="In the menu"
                          className={field}
                          disabled={draft.entries.some((c) => c.parentEntryId === e.id)}
                        >
                          <option value="">At the top</option>
                          {parents.map((p) => (
                            <option key={p.id} value={p.id}>
                              Under {p.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex items-center gap-1 text-neutral-500">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 hover:text-neutral-900 disabled:opacity-30" aria-label="Move up">
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === draft.entries.length - 1}
                          className="px-1 hover:text-neutral-900 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button type="button" onClick={() => remove(e.id)} className="px-1 hover:text-red-600" aria-label="Take out">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {draft.entries.length < MAX_THEME_ENTRIES && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => add("PAGE")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                    + Page
                  </button>
                  <button type="button" onClick={() => add("CURATIONS")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                    + A page for each curation
                  </button>
                  {!draft.entries.some((e) => e.kind === "CONTACT") && (
                    <button type="button" onClick={() => add("CONTACT")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                      + Contact panel
                    </button>
                  )}
                </div>
              )}
              <p className="mt-3 text-xs text-neutral-400">
                The Theme button on a site&apos;s Pages page makes these pages, straight into Live Pages, leaving out any
                the site already has by name. A curation&apos;s page gets its works; a Profile stories component gets the
                Artist Statement, Biography / CV and Galleries. The site menu is set if the site has none.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              {saved && <span className="text-sm text-green-700">Saved</span>}
            </div>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New theme name"
            className={field}
          />
          <button
            type="button"
            onClick={create}
            disabled={!newName.trim() || isPending}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
          >
            New
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-3">
          {themes.length === 0 && <p className="text-sm text-neutral-400">No themes yet.</p>}
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                t.id === selectedId
                  ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {t.name}
              <span className="ml-2 text-xs text-neutral-400">{t.entries.length} pages</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={!selected || isPending}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
        >
          Delete
        </button>
      </aside>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this theme?"
        message={`"${selected?.name ?? ""}" will be deleted. Sites already made with it keep their pages.`}
        confirmLabel="Delete theme"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
