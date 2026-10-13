"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  clearPageComponent,
  movePageComponent,
  setPageComponent,
  setPageComponentItems,
  setPageComponentText,
} from "@/lib/actions/pageComponents";
import type { CurationDetail } from "@/lib/actions/curations";
import {
  MAX_SECTION_TEXT,
  curationSectionLabel,
  type CurationSectionData,
} from "@/lib/curationSections";
import {
  MAX_TYPED_TEXT,
  arrangeItems,
  contentFits,
  contentKindOf,
  hiddenItems,
  isTypedBlock,
  type ComponentContent,
  type ContentKind,
} from "@/lib/pageComponents";
import { blockTypeLabel, type BlockBuildLayout, type LayoutBlock } from "@/lib/pageStyleLayout";
import { blockWidthOf, groupBlocksByRow, rowKey, rowSettingsOf } from "@/lib/rowLayout";
import { isTextComponent, mergeTextStyle } from "@/lib/textStyle";
import { useSiteData } from "@/lib/siteData";
import { rowBlockClass, rowBlockStyle, rowClass } from "@/components/pageRows";
import { BlockShape, Labelled } from "@/components/blockShapes";
import { bodyTextCss } from "@/components/textStyleCss";
import { PAGE_DESKTOP_WIDTH, PageFrame, ScaledFrame } from "@/components/visualEditorParts";
import SignupFormSetup from "@/components/SignupFormSetup";

// Arrange for a Block Build page (2026-10-07; 2026-10-13 from Craig's
// mockup: Page Styles set the layout, curations what's available, and
// the page brings them together) — shown in the Pages page's Preview
// panel. On the left, the page's curation's works and its Description,
// Video and Supporting Images; on the right, the page's Display Style
// (desktop width) with what each component holds drawn in it:
// - A Header or Byline is typed straight in.
// - Drag the works or a section onto a component to put it there. A
//   component holds one, and takes only what fits it (see
//   lib/pageComponents.ts) — while dragging, the components it fits are
//   outlined in blue and the rest fade.
// - Works and Supporting Images show as pictures: drag one onto another
//   to change the order, ✕ to remove it from this page, and click a
//   removed one (listed below) to put it back.
// - The Description can be edited for this page only; "Use the
//   curation's" goes back to the curation's own.
// - Drag a component's bar to another component to move it, or back
//   onto the list (which turns red), or press its ✕, to empty it.
// Every change saves straight away. The style itself isn't changed here.
// A Sign-up form component (2026-10-10) is set up with its own button
// (SignupFormSetup); until then the page shows nothing there. A Logo
// (2026-10-13) shows the artist's Logo from Settings.

const TRAY_ID = "tray";

// Something in the list that can go in a component: a section, or
// (`sectionId` null) the curation's works.
type Content = { sectionId: string | null; kind: ContentKind; label: string; detail: string };

// What's being dragged: something from the list or a component (to
// fill, move or empty a component), or one picture within a component
// (to change the order).
type DragData =
  | { type: "content"; content: Content; fromBlockId: string | null }
  | { type: "item"; blockId: string; itemId: string; url: string | null };

// What a droppable is, so a drag only meets the targets it can use.
type DropData =
  | { kind: "tray" }
  | { kind: "block"; block: LayoutBlock }
  | { kind: "item"; blockId: string; itemId: string };

// One picture in a component: a work or a Supporting Image.
type Item = { id: string; url: string | null; title: string };

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

// A line saying what a section holds: the start of its text, or how
// many pictures.
function sectionDetail(section: CurationSectionData): string {
  if (section.type === "VIDEO") return section.media.length > 0 ? "Video chosen" : "No video yet";
  if (section.type === "IMAGES") {
    return section.media.length === 1 ? "1 image" : `${section.media.length} images`;
  }
  const text = (section.text || "").trim();
  if (!text) return "Empty";
  return text.length > DETAIL_LENGTH ? `${text.slice(0, DETAIL_LENGTH)}…` : text;
}

// A drag only meets what it can use: a picture meets the other pictures
// of its own component; anything else meets the components and the list.
const collide: CollisionDetection = (args) => {
  const dragged = args.active.data.current as DragData | undefined;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const target = c.data.current as DropData | undefined;
    if (!target || !dragged) return false;
    if (dragged.type === "item") {
      return target.kind === "item" && target.blockId === dragged.blockId;
    }
    return target.kind !== "item";
  });
  return pointerWithin({ ...args, droppableContainers });
};

export default function PageSectionsArranger({
  siteId,
  pageId,
  curationId,
  layout,
}: {
  siteId: string;
  pageId: string;
  curationId: string;
  layout: BlockBuildLayout;
}) {
  const siteData = useSiteData();
  const [curation, setCuration] = useState<CurationDetail | null>(null);
  const [sections, setSections] = useState<CurationSectionData[] | null>(null);
  // What each component holds, by block id.
  const [contents, setContents] = useState<Map<string, ComponentContent>>(new Map());
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The Sign-up forms set up (by block id), and the one being set up.
  const [signupsSetUp, setSignupsSetUp] = useState<Set<string>>(new Set());
  const [settingUp, setSettingUp] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rows = groupBlocksByRow(layout.blocks);

  const load = useCallback(
    () =>
      Promise.all([
        siteData.getCuration(curationId),
        siteData.listSections(curationId),
        siteData.getComponents(pageId),
        siteData.getSignupForms(pageId),
        siteData.getArtist(),
      ]).then(([loadedCuration, loadedSections, components, signupForms, artist]) => {
        setLogoUrl(artist?.logoUrl ?? null);
        setCuration(loadedCuration);
        setSections(loadedSections);
        setContents(new Map(components.map((c) => [c.blockId, c])));
        setSignupsSetUp(new Set(signupForms.map((f) => f.blockId)));
      }),
    [siteData, curationId, pageId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const sectionById = new Map((sections ?? []).map((s) => [s.id, s]));
  const sectionTypes = new Map((sections ?? []).map((s) => [s.id, s.type]));

  // Changes one component's content on screen, then saves; if the save
  // is refused, says why and reloads what's saved.
  const change = async (
    update: (prev: Map<string, ComponentContent>) => Map<string, ComponentContent>,
    save: () => Promise<{ ok: true } | { error: string }>
  ) => {
    setError(null);
    setContents((prev) => update(new Map(prev)));
    const result = await save();
    if ("error" in result) {
      setError(result.error);
      load();
    }
  };

  const fill = (blockId: string, sectionId: string | null) =>
    change(
      (m) =>
        m.set(blockId, {
          blockId,
          source: sectionId === null ? "WORKS" : "SECTION",
          sectionId,
          text: null,
          hiddenIds: [],
          orderIds: [],
        }),
      () => setPageComponent(siteId, pageId, blockId, sectionId)
    );

  const move = (fromBlockId: string, toBlockId: string) =>
    change(
      (m) => {
        const moving = m.get(fromBlockId);
        m.delete(fromBlockId);
        if (moving) m.set(toBlockId, { ...moving, blockId: toBlockId });
        return m;
      },
      () => movePageComponent(siteId, pageId, fromBlockId, toBlockId)
    );

  const empty = (blockId: string) =>
    change(
      (m) => {
        m.delete(blockId);
        return m;
      },
      () => clearPageComponent(siteId, pageId, blockId)
    );

  // A Header's typed text (blank empties it), or this page's
  // Description (null = the curation's own).
  const saveText = (block: LayoutBlock, text: string | null) =>
    change(
      (m) => {
        const typed = isTypedBlock(block.type);
        if (typed && !text?.trim()) {
          m.delete(block.id);
          return m;
        }
        const current = m.get(block.id);
        const next: ComponentContent = typed
          ? {
              blockId: block.id,
              source: "TYPED",
              sectionId: null,
              text: text?.trim() ?? null,
              hiddenIds: [],
              orderIds: [],
            }
          : { ...current!, text };
        return m.set(block.id, next);
      },
      () => setPageComponentText(siteId, pageId, block.id, text)
    );

  const saveItems = (blockId: string, items: { hiddenIds: string[]; orderIds: string[] }) =>
    change(
      (m) => {
        const current = m.get(blockId);
        return current ? m.set(blockId, { ...current, ...items }) : m;
      },
      () => setPageComponentItems(siteId, pageId, blockId, items)
    );

  // A component's pictures — the curation's works or Supporting Images —
  // all of them, in the curation's order.
  const itemsOf = (content: ComponentContent): Item[] => {
    if (content.source === "WORKS") {
      return (curation?.works ?? []).map((w) => ({
        id: w.artworkId,
        url: w.imageUrl,
        title: w.catalogueName,
      }));
    }
    const section = content.sectionId ? sectionById.get(content.sectionId) : undefined;
    if (section?.type !== "IMAGES") return [];
    return section.media.map((m) => ({ id: m.imageId, url: m.url, title: "" }));
  };

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as DragData | undefined) ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const data = dragging;
    setDragging(null);
    const target = e.over?.data.current as DropData | undefined;
    if (!data || !target) return;

    if (data.type === "item") {
      if (target.kind !== "item" || target.itemId === data.itemId) return;
      const content = contents.get(data.blockId);
      if (!content) return;
      const ids = arrangeItems(itemsOf(content), (i) => i.id, content).map((i) => i.id);
      const from = ids.indexOf(data.itemId);
      const to = ids.indexOf(target.itemId);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      saveItems(data.blockId, { hiddenIds: content.hiddenIds, orderIds: ids });
      return;
    }

    const from = data.fromBlockId;
    if (target.kind === "tray") {
      if (from) empty(from);
      return;
    }
    if (target.kind !== "block") return;
    const block = target.block;
    if (block.id === from || !contentFits(block.type, data.content.kind)) return;
    if (from) move(from, block.id);
    else fill(block.id, data.content.sectionId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <Tray
          sections={sections}
          removing={dragging?.type === "content" && !!dragging.fromBlockId}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {error && (
            <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <ScaledFrame device="desktop" desktopWidth={PAGE_DESKTOP_WIDTH}>
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
                      {row.map((b) => {
                        const content = contents.get(b.id) ?? null;
                        const kind = content ? contentKindOf(content, sectionTypes) : null;
                        const textStyle = isTextComponent(b.type)
                          ? mergeTextStyle(layout.textStyles[b.type], b.textStyle)
                          : undefined;
                        return (
                          <div
                            key={b.id}
                            className={rowBlockClass("desktop")}
                            style={rowBlockStyle(blockWidthOf(b))}
                          >
                            <Slot block={b} dragging={dragging}>
                              {b.type === "logo" ? (
                                <Labelled label={blockTypeLabel(b.type)}>
                                  {logoUrl ? (
                                    <img src={logoUrl} alt="" className="block w-full" />
                                  ) : (
                                    <p className="py-4 text-center text-sm text-neutral-400">
                                      No logo yet — upload one in Settings → Invoicing.
                                    </p>
                                  )}
                                </Labelled>
                              ) : b.type === "signup" ? (
                                <SignupSlot
                                  block={b}
                                  gridSpacing={layout.gridSpacing}
                                  setUp={signupsSetUp.has(b.id)}
                                  onSetUp={() => setSettingUp(b.id)}
                                />
                              ) : isTypedBlock(b.type) ? (
                                <TypedSlot
                                  key={content?.text ?? ""}
                                  label={blockTypeLabel(b.type)}
                                  byline={b.type === "byline"}
                                  text={content?.text ?? ""}
                                  style={textStyle ? bodyTextCss(textStyle) : undefined}
                                  onSave={(text) => saveText(b, text)}
                                />
                              ) : !content || !kind || !contentFits(b.type, kind) ? (
                                <Labelled label={blockTypeLabel(b.type)}>
                                  <BlockShape
                                    type={b.type}
                                    doors={b.doors}
                                    signup={b.signup}
                                    spacing={layout.gridSpacing}
                                  />
                                </Labelled>
                              ) : (
                                <FilledSlot
                                  block={b}
                                  content={content}
                                  kind={kind}
                                  section={
                                    content.sectionId ? sectionById.get(content.sectionId) : undefined
                                  }
                                  items={itemsOf(content)}
                                  textStyle={textStyle ? bodyTextCss(textStyle) : undefined}
                                  dragging={dragging}
                                  onEmpty={() => empty(b.id)}
                                  onSaveText={(text) => saveText(b, text)}
                                  onSaveItems={(items) => saveItems(b.id, items)}
                                />
                              )}
                            </Slot>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </PageFrame>
          </ScaledFrame>
        </div>
      </div>

      {settingUp && (
        <SignupFormSetup
          siteId={siteId}
          pageId={pageId}
          blockId={settingUp}
          onClose={() => setSettingUp(null)}
          onSaved={(setUp) =>
            setSignupsSetUp((prev) => {
              const next = new Set(prev);
              if (setUp) next.add(settingUp);
              else next.delete(settingUp);
              return next;
            })
          }
        />
      )}

      <DragOverlay dropAnimation={null}>
        {dragging?.type === "content" && (
          <div
            className={`rounded-md border bg-white px-3 py-2 shadow-md ${
              dragging.fromBlockId ? "border-neutral-400" : "border-blue-500"
            }`}
          >
            <ContentText content={dragging.content} />
          </div>
        )}
        {dragging?.type === "item" && (
          <div className="h-20 w-20 overflow-hidden rounded-md shadow-md">
            {dragging.url ? (
              <img src={dragging.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-neutral-200" />
            )}
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
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID, data: { kind: "tray" } });
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
  const data: DragData = { type: "content", content, fromBlockId: null };
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

// One component on the page, as a drop target: while something is
// dragged it's outlined in blue if that fits it, or faded if not.
function Slot({
  block,
  dragging,
  children,
}: {
  block: LayoutBlock;
  dragging: DragData | null;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `block:${block.id}`,
    data: { kind: "block", block },
  });
  const contentDrag = dragging?.type === "content" ? dragging : null;
  const fits = contentDrag ? contentFits(block.type, contentDrag.content.kind) : false;
  const highlight = !contentDrag
    ? ""
    : fits
      ? isOver
        ? "ring-4 ring-blue-500"
        : "ring-2 ring-blue-300"
      : "opacity-40";
  return (
    <div ref={setNodeRef} className={`relative rounded-md ${highlight}`}>
      {children}
    </div>
  );
}

// A Header or Byline, typed straight in; saves when left.
function TypedSlot({
  label,
  byline,
  text,
  style,
  onSave,
}: {
  label: string;
  byline: boolean;
  text: string;
  style: CSSProperties | undefined;
  onSave: (text: string) => void;
}) {
  const [value, setValue] = useState(text);
  return (
    <Labelled label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() !== text && onSave(value)}
        maxLength={MAX_TYPED_TEXT}
        placeholder={byline ? "Type the byline…" : "Type the header…"}
        className={`w-full rounded-md border border-neutral-200 bg-white px-3 py-2 focus:border-neutral-400 focus:outline-none ${
          byline ? "text-xl text-neutral-600" : "text-3xl text-neutral-900"
        }`}
        style={style}
      />
    </Labelled>
  );
}

// A Sign-up form component: whether it's set up, and its Set up button.
function SignupSlot({
  block,
  gridSpacing,
  setUp,
  onSetUp,
}: {
  block: LayoutBlock;
  gridSpacing: BlockBuildLayout["gridSpacing"];
  setUp: boolean;
  onSetUp: () => void;
}) {
  return (
    <div className="relative">
      <Labelled label={blockTypeLabel(block.type)}>
        <BlockShape type={block.type} doors={block.doors} signup={block.signup} spacing={gridSpacing} />
      </Labelled>
      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/85 p-3">
        <div className="flex items-center gap-4 rounded-md border border-neutral-300 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-medium text-neutral-900">Sign-up form</p>
            <p className="text-xs text-neutral-500">
              {setUp ? "Set up" : "Not set up — the page shows nothing here yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={onSetUp}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            {setUp ? "Edit" : "Set up"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A component holding the works or a section, drawn with what it shows.
// Its bar is dragged to move or empty it.
function FilledSlot({
  block,
  content,
  kind,
  section,
  items,
  textStyle,
  dragging,
  onEmpty,
  onSaveText,
  onSaveItems,
}: {
  block: LayoutBlock;
  content: ComponentContent;
  kind: ContentKind;
  section: CurationSectionData | undefined;
  items: Item[];
  textStyle: CSSProperties | undefined;
  dragging: DragData | null;
  onEmpty: () => void;
  onSaveText: (text: string | null) => void;
  onSaveItems: (items: { hiddenIds: string[]; orderIds: string[] }) => void;
}) {
  const barContent: Content =
    kind === "WORKS" || !section ? WORKS : sectionContent(section);
  const edited = kind === "DESCRIPTION" && content.text !== null;

  let body: ReactNode = null;
  if (kind === "WORKS" || kind === "IMAGES") {
    body = (
      <ItemsGrid
        blockId={block.id}
        items={items}
        content={content}
        note={block.type === "image" ? "Only the first is shown." : null}
        dragging={dragging}
        onSave={onSaveItems}
      />
    );
  } else if (kind === "DESCRIPTION") {
    body = (
      <DescriptionText
        key={`${content.text ?? ""}|${section?.text ?? ""}`}
        text={content.text ?? section?.text ?? ""}
        curationText={section?.text ?? ""}
        style={textStyle}
        onSave={onSaveText}
      />
    );
  } else if (kind === "VIDEO") {
    const video = section?.media[0];
    body = video ? (
      video.posterUrl ? (
        <img src={video.posterUrl} alt="" className="aspect-video w-full rounded object-cover" />
      ) : (
        <video src={video.url} className="aspect-video w-full rounded bg-black" />
      )
    ) : (
      <p className="py-6 text-center text-sm text-neutral-400">
        No video yet — choose one on the Curations page.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-blue-500 bg-white p-3">
      <ContentBar
        blockId={block.id}
        label={blockTypeLabel(block.type)}
        content={barContent}
        note={edited ? "Edited for this page" : null}
        action={
          edited ? { label: "Use the curation's", onClick: () => onSaveText(null) } : null
        }
        onEmpty={onEmpty}
      />
      {body}
    </div>
  );
}

// The bar above a filled component: what kind of component it is, what
// it holds, and ✕ to empty it. Dragged to move or empty the component.
function ContentBar({
  blockId,
  label,
  content,
  note,
  action,
  onEmpty,
}: {
  blockId: string;
  label: string;
  content: Content;
  note: string | null;
  action: { label: string; onClick: () => void } | null;
  onEmpty: () => void;
}) {
  const data: DragData = { type: "content", content, fromBlockId: blockId };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `filled:${blockId}`,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`mb-2 flex cursor-grab items-center gap-3 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{content.label}</p>
      {note && <p className="text-xs text-neutral-500">{note}</p>}
      <div className="flex-1" />
      {action && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={action.onClick}
          className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
        >
          {action.label}
        </button>
      )}
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

// The Description in a Text or Text grid component, editable for this
// page; saves when left. Saving the curation's own text unchanged keeps
// it following the curation.
function DescriptionText({
  text,
  curationText,
  style,
  onSave,
}: {
  text: string;
  curationText: string;
  style: CSSProperties | undefined;
  onSave: (text: string | null) => void;
}) {
  const [value, setValue] = useState(text);
  const save = () => {
    const trimmed = value.trim();
    if (trimmed === text.trim()) return;
    onSave(trimmed === curationText.trim() ? null : trimmed);
  };
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      maxLength={MAX_SECTION_TEXT}
      rows={6}
      placeholder="The curation has no description yet — write one here for this page."
      className="w-full resize-y rounded-md border border-neutral-200 p-2 text-xl text-neutral-800 focus:border-neutral-400 focus:outline-none"
      style={style}
    />
  );
}

// Works or Supporting Images as this page shows them: drag one onto
// another to change the order, ✕ to remove it from this page. Removed
// ones are listed below; click one to put it back.
function ItemsGrid({
  blockId,
  items,
  content,
  note,
  dragging,
  onSave,
}: {
  blockId: string;
  items: Item[];
  content: ComponentContent;
  note: string | null;
  dragging: DragData | null;
  onSave: (items: { hiddenIds: string[]; orderIds: string[] }) => void;
}) {
  const shown = arrangeItems(items, (i) => i.id, content);
  const removed = hiddenItems(items, (i) => i.id, content);
  const orderIds = shown.map((i) => i.id);

  return (
    <div>
      {note && <p className="mb-2 text-xs text-neutral-500">{note}</p>}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          {items.length === 0 ? "Nothing in the curation yet." : "Everything has been removed."}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {shown.map((item) => (
            <ItemTile
              key={item.id}
              blockId={blockId}
              item={item}
              dragging={dragging}
              onRemove={() =>
                onSave({
                  hiddenIds: [...content.hiddenIds, item.id],
                  orderIds: orderIds.filter((id) => id !== item.id),
                })
              }
            />
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="mt-3 border-t border-neutral-200 pt-2">
          <p className="mb-1.5 text-xs text-neutral-500">
            Removed from this page — click one to put it back:
          </p>
          <div className="flex flex-wrap gap-2">
            {removed.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onSave({
                    hiddenIds: content.hiddenIds.filter((id) => id !== item.id),
                    orderIds: [...orderIds, item.id],
                  })
                }
                title={item.title ? `Put back ${item.title}` : "Put back"}
                className="h-16 w-16 overflow-hidden rounded opacity-50 hover:opacity-100"
              >
                {item.url ? (
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-neutral-200" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// One picture: dragged onto another to change the order, ✕ to remove.
function ItemTile({
  blockId,
  item,
  dragging,
  onRemove,
}: {
  blockId: string;
  item: Item;
  dragging: DragData | null;
  onRemove: () => void;
}) {
  const drag = useDraggable({
    id: `item:${blockId}:${item.id}`,
    data: { type: "item", blockId, itemId: item.id, url: item.url } satisfies DragData,
  });
  const drop = useDroppable({
    id: `itemdrop:${blockId}:${item.id}`,
    data: { kind: "item", blockId, itemId: item.id } satisfies DropData,
  });
  const target =
    dragging?.type === "item" &&
    dragging.blockId === blockId &&
    dragging.itemId !== item.id &&
    drop.isOver;
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      title={item.title || undefined}
      className={`group relative cursor-grab overflow-hidden rounded active:cursor-grabbing ${
        drag.isDragging ? "opacity-30" : ""
      } ${target ? "ring-4 ring-blue-500" : ""}`}
    >
      {item.url ? (
        <img src={item.url} alt="" draggable={false} className="aspect-square w-full object-cover" />
      ) : (
        <div className="aspect-square w-full bg-neutral-100" />
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label="Remove from this page"
        title="Remove from this page"
        className="absolute right-1.5 top-1.5 hidden rounded bg-black/60 px-2 py-0.5 text-sm text-white group-hover:block"
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
