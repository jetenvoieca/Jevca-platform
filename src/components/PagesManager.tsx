"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  useRegisterPageLayoutOpen,
  useRegisterPageThemeOpen,
  useRegisterPageViewReturn,
} from "@/lib/pageHeaderActions";
import { useRouter } from "next/navigation";
import {
  createPage,
  deletePage,
  reorderPages,
  updatePageDetails,
  updateSiteMenuStyle,
  type PageDetailsInput,
} from "@/lib/actions/pages";
import type { CurationSummary } from "@/lib/actions/curations";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { MenuStyleSummary } from "@/lib/actions/menuStyles";
import { ThemedStyleOptions } from "@/components/ThemedStyleList";
import { LiveSiteData } from "@/lib/siteData";
import PageDetailsModal from "@/components/PageDetailsModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { applySiteTheme } from "@/lib/actions/siteThemes";
import PagePreview from "@/components/PagePreview";
import CanvasArranger from "@/components/CanvasArranger";
import PageSectionsArranger from "@/components/PageSectionsArranger";
import PageLayoutEditor from "@/components/PageLayoutEditor";
import { ContactPanelProvider } from "@/components/ContactPanel";
import type { ContactPanelSettings } from "@/lib/contactPanel";

// The preview's Contact panel, once its ✕ has slid it away, stays away
// until the page is selected again.
const stayClosed = () => {};

export type PageListItem = {
  id: string;
  title: string;
  visible: boolean;
  curationId: string | null;
  pageStyleId: string | null;
  menuStyleId: string | null;
  parentId: string | null;
  // A Contact panel page's panel (2026-11-03 — see lib/contactPanel.ts).
  contactPanel: ContactPanelSettings | null;
};

type ListKey = "live" | "hidden";

// Website → Pages (2026-10-04, from Craig's mockup): a Preview panel on
// the left; on the right, Add / Edit / Arrange / Delete above two lists,
// Live Pages and Hidden Pages. Clicking a page selects it — Edit,
// Arrange and Delete act on the selected page. Pages are dragged to
// reorder within a list or moved between the two (moving one changes
// whether it's live). Every drop saves both lists at once via
// reorderPages. Add and Edit open the same modal (PageDetailsModal); a
// new page starts in Hidden Pages. The selected page is shown in the
// Preview panel (PagePreview), in its Display Style if it has one
// (2026-10-05), from the site's working data (LiveSiteData). The panel
// has no heading, page title or inner padding (2026-10-07), so the page
// fills it as it fills the browser on the published site.
//
// Arrange:
// - Canvas (2026-10-05): opens the full-screen canvas editor
//   (CanvasArranger).
// - Block Build with a curation (2026-10-07, from Craig's mockup):
//   the Preview panel becomes PageSectionsArranger — the Header typed
//   in, the curation's works and sections dragged onto the style's
//   components, works and images removed or reordered for this page
//   (2026-10-13) — with a Close button
//   under Hidden Pages. Choosing another page, Add or Edit closes it.
// Closing either redraws the preview.
//
// Site menu (2026-10-06): under Live Pages, the Menu Style the site's
// menu uses (Templates → Menus) — saved as soon as it's changed. A page
// can have its own instead, chosen in its Edit. A page sitting under
// another in the menu (2026-10-25, chosen in its Edit) shows ↳ and which.
//
// Theme (2026-11-03, admin only — the site header's Theme icon,
// PageThemeButton): choose a Site Theme (Templates → Site Themes) to make
// all its pages on this site at once — see applySiteTheme. With a Plan
// (2026-11-09) only the themes it allows are offered.
export default function PagesManager({
  siteId,
  artistId,
  pages,
  curations,
  pageStyles,
  menuStyles,
  siteMenuStyleId,
  initialPageId = null,
  canEditStyles,
  themes,
}: {
  siteId: string;
  artistId: string;
  pages: PageListItem[];
  curations: CurationSummary[];
  pageStyles: PageStyleSummary[];
  menuStyles: MenuStyleSummary[];
  siteMenuStyleId: string | null;
  // The page to start on (coming back from its Display Style).
  initialPageId?: string | null;
  // Whether Layout (with its Template button — editing the page's
  // Display Style, shared by every site) is offered — admin only
  // (2026-10-26).
  canEditStyles: boolean;
  // The Site Themes the Theme button offers (admin only; the site's
  // plan's, if it has one).
  themes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [live, setLive] = useState(() => pages.filter((p) => p.visible));
  const [hidden, setHidden] = useState(() => pages.filter((p) => !p.visible));
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPageId && pages.some((p) => p.id === initialPageId) ? initialPageId : null,
  );
  const [dragged, setDragged] = useState<{ id: string; from: ListKey } | null>(null);
  // Where the dragged page would land: before `beforeId` in `list`, or at
  // the end of `list` when beforeId is null.
  const [dropTarget, setDropTarget] = useState<{ list: ListKey; beforeId: string | null } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Theme: its list open, the theme chosen (to confirm), and what it did.
  const [themeListOpen, setThemeListOpen] = useState(false);
  const [themeToApply, setThemeToApply] = useState<{ id: string; name: string } | null>(null);
  const [themeMessage, setThemeMessage] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  // The page's layout being edited on the page (2026-10-22).
  const [layingOut, setLayingOut] = useState(false);
  // Bumped when Arrange closes, so the preview reloads what it shows.
  const [previewVersion, setPreviewVersion] = useState(0);
  const [siteMenuId, setSiteMenuId] = useState(siteMenuStyleId ?? "");
  useEffect(() => setSiteMenuId(siteMenuStyleId ?? ""), [siteMenuStyleId]);

  const changeSiteMenu = (id: string) => {
    setSiteMenuId(id);
    startTransition(() => updateSiteMenuStyle(siteId, id || null));
  };

  // Fresh server data (after a delete, or any refresh) replaces local state.
  useEffect(() => {
    setLive(pages.filter((p) => p.visible));
    setHidden(pages.filter((p) => !p.visible));
  }, [pages]);

  const selected = [...live, ...hidden].find((p) => p.id === selectedId) ?? null;
  // A Contact panel page (2026-11-03) previews its panel over the home
  // page (the first Live Page); it has nothing of its own to arrange.
  const previewed = selected?.contactPanel ? (live.find((p) => !p.contactPanel) ?? null) : selected;
  const previewedStyle = previewed ? (pageStyles.find((s) => s.id === previewed.pageStyleId) ?? null) : null;
  const selectedStyle = selected ? (pageStyles.find((s) => s.id === selected.pageStyleId) ?? null) : null;
  const canvasStyle = selectedStyle?.type === "CANVAS" ? selectedStyle : null;
  // A Block Build page can be arranged with or without a curation
  // (2026-10-26 — e.g. a page of profile stories).
  const blockBuildStyle = selectedStyle?.type === "BLOCK_BUILD" ? selectedStyle : null;
  const canArrange = !!canvasStyle || !!blockBuildStyle;
  const arrangingSections = arranging && !!blockBuildStyle;

  const closeArrange = useCallback(() => {
    setArranging(false);
    setPreviewVersion((v) => v + 1);
  }, []);
  // While arranging, the site header's eye closes Arrange (ViewPageButton).
  useRegisterPageViewReturn(arrangingSections ? closeArrange : null);
  // The site header's Layout icon (PageLayoutButton, 2026-11-03) opens the
  // selected page's Layout, while it can.
  const openLayout = useCallback(() => {
    setArranging(false);
    setLayingOut(true);
  }, []);
  useRegisterPageLayoutOpen(selected && blockBuildStyle && canEditStyles && !layingOut ? openLayout : null);
  // The site header's Theme icon (PageThemeButton) opens the list of Site
  // Themes — for an admin, when there are any.
  const openThemes = useCallback(() => setThemeListOpen(true), []);
  useRegisterPageThemeOpen(canEditStyles && themes.length > 0 ? openThemes : null);

  // The style has changed: fresh styles from the server, then the preview.
  const closeLayout = () => {
    setLayingOut(false);
    router.refresh();
    setPreviewVersion((v) => v + 1);
  };

  const handleDrop = () => {
    if (!dragged || !dropTarget) return;
    // Dropped back onto its own spot — nothing to change.
    if (dropTarget.beforeId === dragged.id) {
      setDragged(null);
      setDropTarget(null);
      return;
    }
    const source = dragged.from === "live" ? live : hidden;
    const page = source.find((p) => p.id === dragged.id);
    if (!page) return;

    const remove = (list: PageListItem[]) => list.filter((p) => p.id !== page.id);
    const insert = (list: PageListItem[]) => {
      const moved = { ...page, visible: dropTarget.list === "live" };
      const without = remove(list);
      const index =
        dropTarget.beforeId === null ? without.length : without.findIndex((p) => p.id === dropTarget.beforeId);
      return [...without.slice(0, index), moved, ...without.slice(index)];
    };

    setDragged(null);
    setDropTarget(null);
    saveLists(
      dropTarget.list === "live" ? insert(live) : remove(live),
      dropTarget.list === "hidden" ? insert(hidden) : remove(hidden),
    );
  };

  // Shows and saves both lists' new order.
  const saveLists = (nextLive: PageListItem[], nextHidden: PageListItem[]) => {
    setLive(nextLive);
    setHidden(nextHidden);
    startTransition(() =>
      reorderPages(
        siteId,
        nextLive.map((p) => p.id),
        nextHidden.map((p) => p.id),
      ),
    );
  };

  const selectPage = (id: string) => {
    setSelectedId(id === selectedId ? null : id);
    setArranging(false);
    if (layingOut) closeLayout();
  };

  const openModal = (mode: "add" | "edit") => {
    setArranging(false);
    if (layingOut) closeLayout();
    setModalError(null);
    setModal(mode);
  };

  const handleSave = (input: PageDetailsInput) => {
    startTransition(async () => {
      if (modal === "add") {
        const result = await createPage(siteId, input);
        if ("error" in result) {
          setModalError(result.error);
          return;
        }
        setSelectedId(result.id);
      } else if (modal === "edit" && selected) {
        const result = await updatePageDetails(siteId, selected.id, input);
        if ("error" in result) {
          setModalError(result.error);
          return;
        }
      }
      setModal(null);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    setConfirmingDelete(false);
    setSelectedId(null);
    setArranging(false);
    setLayingOut(false);
    startTransition(() => deletePage(siteId, selected.id));
  };

  const renderList = (key: ListKey, title: string, items: PageListItem[]) => (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        // Only claim the end-of-list spot when not over a specific row —
        // a row's own handler sets a more precise target.
        if (e.target === e.currentTarget) setDropTarget({ list: key, beforeId: null });
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleDrop();
      }}
      // Live Pages takes twice the height of Hidden Pages (2026-11-03,
      // Craig's request — a site's live pages are the longer list).
      className={`flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-3 ${
        key === "live" ? "flex-[2]" : "flex-1"
      }`}
    >
      <h2 className="mb-3 text-center text-base text-neutral-800">{title}</h2>
      <div
        className="flex flex-1 flex-col gap-1 overflow-y-auto"
        onDragOver={(e) => {
          if (e.target === e.currentTarget) setDropTarget({ list: key, beforeId: null });
        }}
      >
        {items.length === 0 && (
          <p className="py-4 text-center text-xs text-neutral-400">
            {key === "live" ? "No live pages." : "No hidden pages."}
          </p>
        )}
        {items.map((p) => {
          const showLine = dropTarget?.list === key && dropTarget.beforeId === p.id;
          return (
            <div key={p.id}>
              {showLine && <div className="mb-1 h-0.5 rounded bg-neutral-900" />}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDragged({ id: p.id, from: key })}
                  onDragEnd={() => {
                    setDragged(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget({ list: key, beforeId: p.id });
                  }}
                  onClick={() => selectPage(p.id)}
                  className={`min-w-0 flex-1 cursor-grab truncate rounded-md border px-3 py-2 text-left text-sm active:cursor-grabbing ${
                    p.id === selectedId
                      ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  } ${dragged?.id === p.id ? "opacity-40" : ""}`}
                >
                  {p.parentId ? (
                    <span className="text-neutral-500">
                      <span aria-hidden>↳ </span>
                      {p.title}
                      <span className="ml-2 text-xs text-neutral-400">
                        under {pages.find((q) => q.id === p.parentId)?.title}
                      </span>
                    </span>
                  ) : (
                    p.title
                  )}
                  {p.contactPanel && <span className="ml-2 text-xs text-neutral-400">Contact panel</span>}
                </button>
              </div>
            </div>
          );
        })}
        {dropTarget?.list === key && dropTarget.beforeId === null && dragged && (
          <div className="h-0.5 rounded bg-neutral-900" />
        )}
      </div>
    </div>
  );

  const buttonClass =
    "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  const applyTheme = () => {
    const theme = themeToApply;
    if (!theme) return;
    setThemeToApply(null);
    setThemeMessage(null);
    startTransition(async () => {
      const result = await applySiteTheme(siteId, theme.id);
      if ("error" in result) {
        setThemeMessage(result.error);
        return;
      }
      setThemeMessage(
        `${theme.name}: ${result.created} page${result.created === 1 ? "" : "s"} added` +
          (result.skipped ? `, ${result.skipped} already here` : "") +
          ".",
      );
      router.refresh();
    });
  };

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white">
        {selected && layingOut && blockBuildStyle && canEditStyles ? (
          <LiveSiteData siteId={siteId} artistId={artistId}>
            <PageLayoutEditor
              key={selected.id}
              pageId={selected.id}
              curationId={selected.curationId}
              style={blockBuildStyle}
              templateHref={`/templates/page-styles?edit=${blockBuildStyle.id}&back=${encodeURIComponent(
                `/sites/${siteId}/pages?page=${selected.id}`,
              )}`}
              onClose={closeLayout}
            />
          </LiveSiteData>
        ) : selected && arrangingSections && blockBuildStyle ? (
          <LiveSiteData siteId={siteId} artistId={artistId}>
            <PageSectionsArranger
              key={selected.id}
              siteId={siteId}
              pageId={selected.id}
              curationId={selected.curationId}
              curations={curations}
              onCurationChanged={(curationId) => {
                const withCuration = (list: PageListItem[]) =>
                  list.map((p) => (p.id === selected.id ? { ...p, curationId } : p));
                setLive(withCuration);
                setHidden(withCuration);
                router.refresh();
              }}
              layout={blockBuildStyle.layout}
            />
          </LiveSiteData>
        ) : selected && previewed ? (
          <LiveSiteData siteId={siteId} artistId={artistId}>
            <ContactPanelProvider
              panel={selected.contactPanel ? { settings: selected.contactPanel, onClosed: stayClosed } : null}
            >
              <PagePreview
                key={`${selected.id}:${previewVersion}`}
                pageId={previewed.id}
                curationId={previewed.curationId}
                style={previewedStyle}
              />
            </ContactPanelProvider>
          </LiveSiteData>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a page to preview it.</p>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => openModal("add")} disabled={isPending} className={buttonClass}>
            Add
          </button>
          <button
            type="button"
            onClick={() => openModal("edit")}
            disabled={!selected || isPending}
            className={buttonClass}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setLayingOut(false);
              setArranging(true);
            }}
            disabled={!canArrange || isPending}
            title="For Canvas pages, and Block Build pages with a curation"
            className={buttonClass}
          >
            Arrange
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={!selected || isPending}
            className={`${buttonClass} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
          >
            Delete
          </button>
        </div>

        {themeMessage && (
          <p className="-mt-2 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-700">{themeMessage}</p>
        )}
        {renderList("live", "Live Pages", live)}
        <label className="flex items-center gap-3 rounded-lg border border-neutral-300 bg-white px-3 py-2">
          <span className="shrink-0 text-sm text-neutral-800">Site menu</span>
          <select
            value={siteMenuId}
            onChange={(e) => changeSiteMenu(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            <ThemedStyleOptions items={menuStyles} />
          </select>
        </label>
        {renderList("hidden", "Hidden Pages", hidden)}

        {arrangingSections && (
          <div className="flex justify-end rounded-lg border border-neutral-300 bg-white p-3">
            <button
              type="button"
              onClick={closeArrange}
              className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Close
            </button>
          </div>
        )}
      </aside>

      {modal && (
        <PageDetailsModal
          heading={modal === "add" ? "Add page" : "Edit page"}
          initial={
            modal === "edit" && selected
              ? {
                  title: selected.title,
                  curationId: selected.curationId,
                  pageStyleId: selected.pageStyleId,
                  menuStyleId: selected.menuStyleId,
                  parentId: selected.parentId,
                  contactPanel: selected.contactPanel,
                }
              : { title: "", curationId: null, pageStyleId: null, menuStyleId: null, parentId: null, contactPanel: null }
          }
          topPages={pages.filter((p) => !p.parentId && p.id !== (modal === "edit" ? selected?.id : undefined))}
          hasChildren={modal === "edit" && !!selected && pages.some((p) => p.parentId === selected.id)}
          curations={curations}
          pageStyles={pageStyles}
          menuStyles={menuStyles}
          saving={isPending}
          error={modalError}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {arranging && selected && canvasStyle && (
        <CanvasArranger
          siteId={siteId}
          pageId={selected.id}
          pageTitle={selected.title}
          artistId={artistId}
          tileSize={canvasStyle.layout.tileSize}
          backgroundColor={canvasStyle.layout.backgroundColor}
          onClose={closeArrange}
        />
      )}

      {themeListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setThemeListOpen(false)}>
          <div className="w-full max-w-xs rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-medium text-neutral-900">Site Theme</h3>
            <div className="flex flex-col gap-1.5">
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setThemeListOpen(false);
                    setThemeToApply(t);
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!themeToApply}
        title={`Add the ${themeToApply?.name ?? ""} pages?`}
        message="Every page of the theme is added to Live Pages, filled in where it can be. Pages this site already has (by name) are left as they are."
        confirmLabel="Add pages"
        onConfirm={applyTheme}
        onCancel={() => setThemeToApply(null)}
      />

      <ConfirmDialog
        open={confirmingDelete && !!selected}
        title="Delete this page?"
        message={`"${selected?.title ?? ""}" will be deleted. This can't be undone.`}
        confirmLabel="Delete page"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
