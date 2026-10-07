"use client";

import { useEffect, useState, useTransition } from "react";
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
import { LiveSiteData } from "@/lib/siteData";
import PageDetailsModal from "@/components/PageDetailsModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import PagePreview from "@/components/PagePreview";
import CanvasArranger from "@/components/CanvasArranger";
import PageSectionsArranger from "@/components/PageSectionsArranger";

export type PageListItem = {
  id: string;
  title: string;
  visible: boolean;
  curationId: string | null;
  pageStyleId: string | null;
  menuStyleId: string | null;
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
// - Private / Custom with a curation (2026-10-07, from Craig's mockup):
//   the Preview panel becomes PageSectionsArranger — the curation's
//   sections dragged onto the style's components — with a Close button
//   under Hidden Pages. Choosing another page, Add or Edit closes it.
// Closing either redraws the preview.
//
// Site menu (2026-10-06): under Live Pages, the Menu Style the site's
// menu uses (Templates → Menus) — saved as soon as it's changed. A page
// can have its own instead, chosen in its Edit.
export default function PagesManager({
  siteId,
  artistId,
  pages,
  curations,
  pageStyles,
  menuStyles,
  siteMenuStyleId,
}: {
  siteId: string;
  artistId: string;
  pages: PageListItem[];
  curations: CurationSummary[];
  pageStyles: PageStyleSummary[];
  menuStyles: MenuStyleSummary[];
  siteMenuStyleId: string | null;
}) {
  const router = useRouter();
  const [live, setLive] = useState(() => pages.filter((p) => p.visible));
  const [hidden, setHidden] = useState(() => pages.filter((p) => !p.visible));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<{ id: string; from: ListKey } | null>(null);
  // Where the dragged page would land: before `beforeId` in `list`, or at
  // the end of `list` when beforeId is null.
  const [dropTarget, setDropTarget] = useState<{ list: ListKey; beforeId: string | null } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [arranging, setArranging] = useState(false);
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
  const selectedStyle = selected
    ? (pageStyles.find((s) => s.id === selected.pageStyleId) ?? null)
    : null;
  const canvasStyle = selectedStyle?.type === "CANVAS" ? selectedStyle : null;
  // A Private / Custom page is arranged from its curation's sections, so
  // it needs one.
  const customStyle =
    selectedStyle?.type === "PRIVATE" && selected?.curationId ? selectedStyle : null;
  const canArrange = !!canvasStyle || !!customStyle;
  const arrangingSections = arranging && !!customStyle;

  const closeArrange = () => {
    setArranging(false);
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
        dropTarget.beforeId === null
          ? without.length
          : without.findIndex((p) => p.id === dropTarget.beforeId);
      return [...without.slice(0, index), moved, ...without.slice(index)];
    };

    const nextLive = dropTarget.list === "live" ? insert(live) : remove(live);
    const nextHidden = dropTarget.list === "hidden" ? insert(hidden) : remove(hidden);

    setLive(nextLive);
    setHidden(nextHidden);
    setDragged(null);
    setDropTarget(null);

    startTransition(() =>
      reorderPages(
        siteId,
        nextLive.map((p) => p.id),
        nextHidden.map((p) => p.id)
      )
    );
  };

  const selectPage = (id: string) => {
    setSelectedId(id === selectedId ? null : id);
    setArranging(false);
  };

  const openModal = (mode: "add" | "edit") => {
    setArranging(false);
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
      className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3"
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
                className={`w-full cursor-grab truncate rounded-md border px-3 py-2 text-left text-sm active:cursor-grabbing ${
                  p.id === selectedId
                    ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                    : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                } ${dragged?.id === p.id ? "opacity-40" : ""}`}
              >
                {p.title}
              </button>
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

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white">
        {selected && arrangingSections && customStyle && selected.curationId ? (
          <LiveSiteData siteId={siteId} artistId={artistId}>
            <PageSectionsArranger
              key={selected.id}
              siteId={siteId}
              pageId={selected.id}
              curationId={selected.curationId}
              layout={customStyle.layout}
            />
          </LiveSiteData>
        ) : selected ? (
          <LiveSiteData siteId={siteId} artistId={artistId}>
            <PagePreview
              key={`${selected.id}:${previewVersion}`}
              pageId={selected.id}
              curationId={selected.curationId}
              style={selectedStyle}
            />
          </LiveSiteData>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a page to preview it.</p>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => openModal("add")}
            disabled={isPending}
            className={buttonClass}
          >
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
            onClick={() => setArranging(true)}
            disabled={!canArrange || isPending}
            title="For Canvas pages, and Private / Custom pages with a curation"
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

        {renderList("live", "Live Pages", live)}
        <label className="flex items-center gap-3 rounded-lg border border-neutral-300 bg-white px-3 py-2">
          <span className="shrink-0 text-sm text-neutral-800">Site menu</span>
          <select
            value={siteMenuId}
            onChange={(e) => changeSiteMenu(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {menuStyles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
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
                }
              : { title: "", curationId: null, pageStyleId: null, menuStyleId: null }
          }
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
