"use client";

import { useState } from "react";
import type { CurationSummary } from "@/lib/actions/curations";
import type { PageDetailsInput } from "@/lib/actions/pages";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { MenuStyleSummary } from "@/lib/actions/menuStyles";
import { ThemedStyleOptions } from "@/components/ThemedStyleList";
import NumberField from "@/components/NumberField";
import { CONTACT_PANEL_LIMITS, DEFAULT_CONTACT_PANEL, cleanContactPanel, type ContactPanelSettings } from "@/lib/contactPanel";
import { SITE_FONTS } from "@/lib/siteFonts";

// The Pages page's Add / Edit modal (2026-10-04, from Craig's mockup):
// Page Name, Curation and Display Style. The same modal is used for both
// — Edit opens it filled in with the selected page. Display Style is
// one of the Page Styles (Templates → Page Styles, 2026-10-05). With a
// Canvas style there's no Curation to choose — a Canvas page has its own
// placed curations (Arrange on the Pages page) — so it's hidden and
// saved as none. Menu (2026-10-06) is "Site menu" (the one chosen under
// Live Pages) or one of the Menu Styles, for this page only. Under
// (2026-10-25): the page this one sits under in the menu — one of the
// site's pages at the top (`topPages`); not offered for a page that has
// pages under it. Shows (2026-11-03, the ISYT sites' "contact"): the
// page's own content, or the site's Contact panel sliding over whatever
// page is showing (see lib/contactPanel.ts) — then it has no Curation or
// Display Style of its own, and the panel's look is set here.
export default function PageDetailsModal({
  heading,
  initial,
  curations,
  pageStyles,
  menuStyles,
  topPages,
  hasChildren,
  saving,
  error,
  onSave,
  onCancel,
}: {
  heading: string;
  initial: PageDetailsInput;
  curations: CurationSummary[];
  pageStyles: PageStyleSummary[];
  menuStyles: MenuStyleSummary[];
  topPages: { id: string; title: string }[];
  hasChildren: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: PageDetailsInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [curationId, setCurationId] = useState(initial.curationId ?? "");
  const [pageStyleId, setPageStyleId] = useState(initial.pageStyleId ?? "");
  const [menuStyleId, setMenuStyleId] = useState(initial.menuStyleId ?? "");
  const [parentId, setParentId] = useState(initial.parentId ?? "");
  const [panel, setPanel] = useState<ContactPanelSettings | null>(initial.contactPanel);
  const setLook = (patch: Partial<ContactPanelSettings>) => setPanel((p) => cleanContactPanel({ ...p, ...patch }));

  const opens = !!panel;
  const isCanvas = !opens && pageStyles.find((s) => s.id === pageStyleId)?.type === "CANVAS";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <form
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            title,
            curationId: isCanvas || opens ? null : curationId || null,
            pageStyleId: opens ? null : pageStyleId || null,
            menuStyleId: menuStyleId || null,
            parentId: parentId || null,
            contactPanel: panel,
          });
        }}
      >
        <h3 className="sr-only">{heading}</h3>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page Name"
          aria-label="Page Name"
          autoFocus
          className="mb-6 w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />

        <div className="mb-6 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-4">
          <label htmlFor="page-shows" className="text-sm text-neutral-700">
            Shows
          </label>
          <select
            id="page-shows"
            value={panel ? "contact" : ""}
            onChange={(e) => setPanel(e.target.value ? (initial.contactPanel ?? DEFAULT_CONTACT_PANEL) : null)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">Its own content</option>
            <option value="contact">Contact panel over the current page</option>
          </select>

          {!isCanvas && !opens && (
            <>
              <label htmlFor="page-curation" className="text-sm text-neutral-700">
                Curation
              </label>
              <select
                id="page-curation"
                value={curationId}
                onChange={(e) => setCurationId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {curations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {!opens && (
            <>
              <label htmlFor="page-display-style" className="text-sm text-neutral-700">
                Display Style
              </label>
              <select
                id="page-display-style"
                value={pageStyleId}
                onChange={(e) => setPageStyleId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                <ThemedStyleOptions items={pageStyles} />
              </select>
            </>
          )}

          <label htmlFor="page-menu" className="text-sm text-neutral-700">
            Menu
          </label>
          <select
            id="page-menu"
            value={menuStyleId}
            onChange={(e) => setMenuStyleId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">Site menu</option>
            <ThemedStyleOptions items={menuStyles} />
          </select>

          {!hasChildren && (
            <>
              <label htmlFor="page-under" className="text-sm text-neutral-700">
                In the menu
              </label>
              <select
                id="page-under"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="">At the top</option>
                {topPages.map((p) => (
                  <option key={p.id} value={p.id}>
                    Under {p.title}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {isCanvas && (
          <p className="mb-4 text-xs text-neutral-500">A Canvas page&apos;s curations are placed with Arrange.</p>
        )}
        {panel && (
          <div className="mb-6 flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">
              Its menu item slides this panel over whatever page is showing: the phone and email from the artist&apos;s
              Settings, then a form. Messages go to the Inbox; the tick box adds the visitor to Subscribers.
            </p>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Title
              <input
                type="text"
                value={panel.title}
                maxLength={CONTACT_PANEL_LIMITS.title}
                onChange={(e) => setPanel({ ...panel, title: e.target.value })}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <NumberField
              label="Width on a desktop"
              unit="%"
              step={1}
              value={panel.share}
              limits={CONTACT_PANEL_LIMITS.share}
              onCommit={(share) => setLook({ share })}
              wide
            />
            <label className="flex items-center justify-between gap-3 text-sm text-neutral-700">
              Font
              <select
                value={panel.font}
                onChange={(e) => setLook({ font: e.target.value as ContactPanelSettings["font"] })}
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
              >
                {SITE_FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Text size"
              unit="pixels"
              step={1}
              value={panel.textSize}
              limits={CONTACT_PANEL_LIMITS.textSize}
              onCommit={(textSize) => setLook({ textSize })}
              wide
            />
            <NumberField
              label="Title size"
              unit="pixels"
              step={1}
              value={panel.titleSize}
              limits={CONTACT_PANEL_LIMITS.titleSize}
              onCommit={(titleSize) => setLook({ titleSize })}
              wide
            />
            <label className="flex items-center justify-between gap-3 text-sm text-neutral-700">
              Text colour
              <input
                type="color"
                value={panel.textColour}
                onChange={(e) => setLook({ textColour: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-neutral-700">
              Background
              <input
                type="color"
                value={panel.background}
                onChange={(e) => setLook({ background: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
              />
            </label>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
