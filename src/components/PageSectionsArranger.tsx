"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { clearPageComponent, setPageComponent } from "@/lib/actions/pageComponents";
import { groupBlocksByRow } from "@/lib/blocks";
import { curationSectionLabel, type CurationSectionData } from "@/lib/curationSections";
import { contentFits, type ContentKind } from "@/lib/pageComponents";
import {
  blockTypeLabel,
  blockWidthOf,
  rowKey,
  rowSettingsOf,
  type CustomLayout,
  type GridSpacing,
  type LayoutBlock,
} from "@/lib/pageStyleLayout";
import { useSiteData } from "@/lib/siteData";
import { rowBlockClass, rowBlockStyle, rowClass } from "@/components/pageRows";
import { BlockShape, Labelled } from "@/components/PageStylePreview";
import { PageFrame, ScaledFrame } from "@/components/visualEditorParts";

// Arrange for a Private / Custom page (2026-10-07, from Craig's mockup)
// — shown in the Pages page's Preview panel. On the left, the page's
// curation's sections, plus its works; on the right, the page's Display
// Style, drawn as in the Page Styles editor (desktop width). Drag one
// onto a component to put it there. A component holds one, and takes
// only what fits it (see lib/pageComponents.ts) — while dragging, the
// components it fits are outlined in blue and the rest fade. Drag a
// component's content to another component to move it, or back onto
// the list (which turns red), or press its ✕, to empty the component.
// Every change saves straight away. The style itself isn't changed here.

const TRAY_ID = "tray";

// Something that can go in a component: a section, or (`sectionId`
// null) the curation's works.
type Content = { sectionId: string | null; kind: ContentKind; label: string; detail: string };

// What's being dragged, and the component it came from (null = the list).
type DragData = { content: Content; fromBlockId: string | null };

const WORKS: Content = {
  sectionId: null,
  kind: "WORKS",
  label: "Works",
  detail: "The curation's works — for a Gallery or Sliding doors",
};

const DETAIL_LENGTH = 60;

function sectionContent(section: CurationSectionData): Content {
  return {
    sectionId: section.id,
    kind: section.type,
    label: curationSectionLabel(section.type),
    detail: sectionDetail(section),
  };
}

// A line to tell sections of the same type apart: the start of its
// text, or what it holds.
function sectionDetail(section: CurationSectionData): string {
  if (section.type === "VIDEO") return section.media.length > 0 ? "Video chosen" : "No video yet";
  if (section.type === "IMAGES") {
    return section.media.length === 1 ? "1 image" : `${section.media.length} images`;
  }
  const text = (section.heading || section.text || "").trim();
  if (!text) return "Empty";
  return text.length > DETAIL_LENGTH ? `${text.slice(0, DETAIL_LENGTH)}…` : text;
}

export default function PageSectionsArranger({
  siteId,
  pageId,
  curationId,
  layout,
}: {
  siteId: string;
  pageId: string;
  curationId: string;
  layout: CustomLayout;
}) {
  const siteData = useSiteData();
  const [sections, setSections] = useState<CurationSectionData[] | null>(null);
  // What each component holds, by block id: a section id, or null for
  // the works.
  const [filled, setFilled] = useState<Map<string, string | null>>(new Map());
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rows = groupBlocksByRow(layout.blocks);

  const load = useCallback(
    () =>
      Promise.all([siteData.listSections(curationId), siteData.getComponents(pageId)]).then(
        ([loadedSections, components]) => {
          setSections(loadedSections);
          setFilled(new Map(components.map((c) => [c.blockId, c.sectionId])));
        }
      ),
    [siteData, curationId, pageId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const contentOf = (sectionId: string | null): Content | null => {
    if (sectionId === null) return WORKS;
    const section = sections?.find((s) => s.id === sectionId);
    return section ? sectionContent(section) : null;
  };

  const put = (blockId: string, sectionId: string | null) => {
    setFilled((prev) => new Map(prev).set(blockId, sectionId));
    return setPageComponent(siteId, pageId, blockId, sectionId);
  };

  const empty = (blockId: string) => {
    setFilled((prev) => {
      const next = new Map(prev);
      next.delete(blockId);
      return next;
    });
    return clearPageComponent(siteId, pageId, blockId);
  };

  // Runs a change; if it's refused, says why and reloads what's saved.
  const save = async (change: () => Promise<{ ok: true } | { error: string }>) => {
    setError(null);
    const result = await change();
    if ("error" in result) {
      setError(result.error);
      load();
    }
  };

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as DragData | undefined) ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const data = dragging;
    setDragging(null);
    const over = e.over;
    if (!data || !over) return;
    const from = data.fromBlockId;

    if (over.id === TRAY_ID) {
      if (from) save(() => empty(from));
      return;
    }

    const block = (over.data.current as { block: LayoutBlock } | undefined)?.block;
    if (!block || block.id === from || !contentFits(block.type, data.content.kind)) return;
    save(async () => {
      const result = await put(block.id, data.content.sectionId);
      if ("error" in result || !from) return result;
      return empty(from);
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <Tray sections={sections} removing={!!dragging?.fromBlockId} />

        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <ScaledFrame device="desktop">
            <PageFrame
              margins={layout.margins}
              device="desktop"
              backgroundColor={layout.backgroundColor}
              backgroundImage={layout.backgroundImage}
            >
              {rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-400">
                  This page&apos;s Display Style has no components yet — add them under Templates
                  → Page Styles.
                </p>
              ) : (
                rows.map((row, i) => {
                  const key = rowKey(row);
                  const settings = rowSettingsOf(layout, key);
                  const above = i > 0 ? rowSettingsOf(layout, rowKey(rows[i - 1])).below : 0;
                  return (
                    <div
                      key={key}
                      className={rowClass(settings.horizontal, settings.vertical, "desktop")}
                      style={{ marginTop: above, gap: settings.between }}
                    >
                      {row.map((b) => (
                        <div
                          key={b.id}
                          className={rowBlockClass("desktop")}
                          style={rowBlockStyle(blockWidthOf(b))}
                        >
                          <Slot
                            block={b}
                            gridSpacing={layout.gridSpacing}
                            content={filled.has(b.id) ? contentOf(filled.get(b.id) ?? null) : null}
                            dragging={dragging}
                            onEmpty={() => save(() => empty(b.id))}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </PageFrame>
          </ScaledFrame>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div
            className={`rounded-md border bg-white px-3 py-2 shadow-md ${
              dragging.fromBlockId ? "border-neutral-400" : "border-blue-500"
            }`}
          >
            <ContentText content={dragging.content} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// The list on the left: the works and the curation's sections, to drag
// onto the page — and, while a component's content is being dragged,
// the place to drop it to empty that component.
function Tray({
  sections,
  removing,
}: {
  sections: CurationSectionData[] | null;
  removing: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID });
  const outline = !removing
    ? "border-neutral-300"
    : isOver
      ? "border-red-500 bg-red-50"
      : "border-dashed border-red-300";
  return (
    <aside className="flex w-56 shrink-0 flex-col">
      <h3 className="mb-2 px-1 text-base text-neutral-800">Sections</h3>
      <div
        ref={setNodeRef}
        className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg border-2 p-2 ${outline}`}
      >
        {sections === null ? (
          <p className="text-xs text-neutral-400">Loading…</p>
        ) : (
          <>
            <TrayItem content={WORKS} />
            {sections.map((s) => (
              <TrayItem key={s.id} content={sectionContent(s)} />
            ))}
            {sections.length === 0 && (
              <p className="text-xs text-neutral-400">
                This curation has no sections yet — add them on the Curations page.
              </p>
            )}
          </>
        )}
        <p className={`mt-1 text-xs ${removing ? "text-red-600" : "text-neutral-400"}`}>
          {removing
            ? "Drop here to empty the component."
            : "Drag onto a component to fill it. Drag back here to empty it."}
        </p>
      </div>
    </aside>
  );
}

function TrayItem({ content }: { content: Content }) {
  const data: DragData = { content, fromBlockId: null };
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `tray:${content.sectionId ?? "works"}`,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 hover:border-neutral-400 active:cursor-grabbing"
    >
      <ContentText content={content} />
    </div>
  );
}

// One component on the page: its outline, and what it holds over it.
// While something is dragged it's outlined in blue if that fits it, or
// faded if not.
function Slot({
  block,
  gridSpacing,
  content,
  dragging,
  onEmpty,
}: {
  block: LayoutBlock;
  gridSpacing: GridSpacing;
  content: Content | null;
  dragging: DragData | null;
  onEmpty: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `block:${block.id}`, data: { block } });
  const fits = dragging ? contentFits(block.type, dragging.content.kind) : false;
  const highlight = !dragging
    ? ""
    : fits
      ? isOver
        ? "ring-4 ring-blue-500"
        : "ring-2 ring-blue-300"
      : "opacity-40";
  return (
    <div ref={setNodeRef} className={`relative rounded-md ${highlight}`}>
      <Labelled label={blockTypeLabel(block.type)}>
        <BlockShape block={block} spacing={gridSpacing} />
      </Labelled>
      {content && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/85 p-3">
          <Filled blockId={block.id} content={content} onEmpty={onEmpty} />
        </div>
      )}
    </div>
  );
}

// What a component holds — dragged to move or empty it.
function Filled({
  blockId,
  content,
  onEmpty,
}: {
  blockId: string;
  content: Content;
  onEmpty: () => void;
}) {
  const data: DragData = { content, fromBlockId: blockId };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `filled:${blockId}`,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex max-w-full cursor-grab items-start gap-3 rounded-md border border-blue-500 bg-white px-4 py-3 shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <ContentText content={content} />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onEmpty}
        aria-label="Empty this component"
        title="Empty this component"
        className="text-neutral-400 hover:text-red-600"
      >
        ✕
      </button>
    </div>
  );
}

function ContentText({ content }: { content: Content }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-neutral-900">{content.label}</p>
      <p className="truncate text-xs text-neutral-500">{content.detail}</p>
    </div>
  );
}
