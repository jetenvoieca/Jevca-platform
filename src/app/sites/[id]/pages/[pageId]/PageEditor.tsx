"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  saveDraftBlocks,
  deletePage,
  menuItemCountForPage,
  updatePageTitle,
  updatePageBackground,
} from "@/lib/actions/pages";
import MediaPicker from "@/components/MediaPicker";
import ArtworkPicker from "@/components/ArtworkPicker";
import ThreeColumnShell from "@/components/ThreeColumnShell";
import LiveBlockPreview from "@/components/LiveBlockPreview";
import type { ContentBlock } from "@/lib/blocks";
import { groupBlocksByRow } from "@/lib/blocks";

// The field-editing UI for one block, by type — pulled out to its own
// function so it can be used identically whether the block is rendered
// full-width or paired side-by-side in a row (2026-09-03), rather than
// being duplicated between the two rendering paths below.
//
// `fill` (2026-09-04) — true when this block sits in a row that has an
// explicit rowHeight. Image/Video below both use ONE MediaPicker call
// each, in every case (row or not) — only the size/crop props change
// (previewClassName/previewObjectFit) — rather than two different
// implementations for the two cases. That divergence (a manual <img>
// for rows vs. MediaPicker's own preview box for standalone) is what
// caused the resize-slider regression on 2026-09-04: the two paths
// drifted out of sync with each other. One call, parameterized, can't
// drift.
function BlockFields({
  block,
  artistId,
  siteId,
  updateBlock,
  fill = false,
}: {
  block: ContentBlock;
  artistId: string;
  siteId: string;
  updateBlock: (id: string, patch: Partial<ContentBlock>) => void;
  fill?: boolean;
}) {
  if (block.type === "header") {
    return (
      <input
        type="text"
        value={block.text}
        onChange={(e) => updateBlock(block.id, { text: e.target.value })}
        placeholder="Page heading…"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-lg font-semibold"
      />
    );
  }

  if (block.type === "text") {
    return (
      <textarea
        value={block.text}
        onChange={(e) => updateBlock(block.id, { text: e.target.value })}
        rows={4}
        placeholder="Write something…"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
    );
  }

  if (block.type === "image") {
    return (
      <div className={fill ? "flex h-full flex-col" : undefined}>
        <div className={fill ? "min-h-0 flex-1" : undefined}>
          <MediaPicker
            artistId={artistId}
            siteId={siteId}
            mode="single"
            label="Add Image"
            previewUrl={block.url || undefined}
            previewClassName={fill ? "h-full w-full" : "max-h-[520px] w-full"}
            previewObjectFit={fill ? "contain" : "cover"}
            onSelect={(imgs) => updateBlock(block.id, { imageId: imgs[0].id, url: imgs[0].url })}
          />
        </div>
        {block.url && (
          <input
            type="text"
            value={block.caption || ""}
            onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
            placeholder="Caption (optional)"
            className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
        )}
      </div>
    );
  }

  if (block.type === "gallery") {
    return (
      <div className="grid grid-cols-4 gap-2">
        {block.images.map((img) => (
          <div key={img.imageId} className="group relative">
            <img src={img.url} alt="" className="aspect-square w-full rounded object-cover" />
            <button
              type="button"
              onClick={() =>
                updateBlock(block.id, {
                  images: block.images.filter((i) => i.imageId !== img.imageId),
                })
              }
              className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 text-xs text-white group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}
        <MediaPicker
          artistId={artistId}
          siteId={siteId}
          mode="multi"
          label="Add Images"
          onSelect={(imgs) =>
            updateBlock(block.id, {
              images: [
                ...block.images,
                ...imgs
                  .filter((img) => !block.images.some((e) => e.imageId === img.id))
                  .map((img) => ({ imageId: img.id, url: img.url })),
              ],
            })
          }
        />
      </div>
    );
  }

  if (block.type === "artwork") {
    return (
      <div>
        {block.previewTitle && (
          <div className="mb-2 flex items-center gap-3">
            {block.previewImageUrl ? (
              <img
                src={block.previewImageUrl}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded bg-neutral-200" />
            )}
            <span className="text-sm text-neutral-700">{block.previewTitle}</span>
          </div>
        )}
        <div className="w-32">
          <ArtworkPicker
            artistId={artistId}
            mode="single"
            label={block.previewTitle ? "Change Artwork" : "Add Artwork"}
            onSelect={(arr) => {
              const a = arr[0];
              updateBlock(block.id, {
                artworkId: a.id,
                previewTitle: a.presentationTitle,
                previewImageUrl: a.imageUrl || undefined,
                previewPrice: a.presentationPrice,
                previewAvailability: a.availability,
              });
            }}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Always shows the artwork&apos;s current title, image, price and status — editing the
          artwork updates every page it appears on.
        </p>
      </div>
    );
  }

  if (block.type === "video") {
    return (
      <div className={fill ? "flex h-full flex-col" : undefined}>
        <div className={fill ? "min-h-0 flex-1" : undefined}>
          <MediaPicker
            artistId={artistId}
            siteId={siteId}
            mode="single"
            videoOnly
            label="Add Video"
            previewUrl={block.posterUrl || block.url || undefined}
            previewKind={block.posterUrl ? "image" : "video"}
            previewClassName={fill ? "h-full w-full" : "max-h-[520px] w-full"}
            previewObjectFit={fill ? "contain" : "cover"}
            onSelect={(vids) =>
              updateBlock(block.id, {
                imageId: vids[0].id,
                url: vids[0].url,
                posterUrl: vids[0].posterUrl || undefined,
              })
            }
          />
        </div>
      </div>
    );
  }

  if (block.type === "textgrid") {
    return (
      <div>
        <p className="mb-2 text-xs text-neutral-400">
          Column headers — e.g. Year / Exhibition / Location
        </p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {block.columns.map((col, ci) => (
            <input
              key={ci}
              type="text"
              value={col}
              onChange={(e) => {
                const next = [...block.columns] as [string, string, string];
                next[ci] = e.target.value;
                updateBlock(block.id, { columns: next });
              }}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium"
            />
          ))}
        </div>

        <div className="space-y-2">
          {block.rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                type="text"
                value={row.cell1}
                onChange={(e) =>
                  updateBlock(block.id, {
                    rows: block.rows.map((r) =>
                      r.id === row.id ? { ...r, cell1: e.target.value } : r
                    ),
                  })
                }
                className="w-1/4 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                type="text"
                value={row.cell2}
                onChange={(e) =>
                  updateBlock(block.id, {
                    rows: block.rows.map((r) =>
                      r.id === row.id ? { ...r, cell2: e.target.value } : r
                    ),
                  })
                }
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                type="text"
                value={row.cell3}
                onChange={(e) =>
                  updateBlock(block.id, {
                    rows: block.rows.map((r) =>
                      r.id === row.id ? { ...r, cell3: e.target.value } : r
                    ),
                  })
                }
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  updateBlock(block.id, { rows: block.rows.filter((r) => r.id !== row.id) })
                }
                className="shrink-0 px-1 text-neutral-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            updateBlock(block.id, {
              rows: [...block.rows, { id: crypto.randomUUID(), cell1: "", cell2: "", cell3: "" }],
            })
          }
          className="mt-2 rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
        >
          + Add Row
        </button>
      </div>
    );
  }

  return null;
}

// A draggable divider (2026-09-04, resize sliders). Pointer capture
// means move/up events keep firing on this element even once the
// cursor leaves it mid-drag, so no document-level listener wiring is
// needed. Reports each incremental pixel delta via onDrag — the caller
// decides what that delta means (a width weight, a height in px).
//
// Hit-target is deliberately wider than the thin visible bar (w-6/h-6,
// 24px, vs the 4px bar drawn inside it) — 2026-09-04, direct report
// that the handle felt like it "jumped away" as the cursor approached.
// A thin target sitting right at a CSS Grid fr-based column boundary
// is exactly the kind of thing sub-pixel rounding + a large adjacent
// hover-reactive element (the image/MediaPicker button) can make feel
// elusive; giving it real width is the standard, robust fix rather
// than fighting pixel-level positioning.
function ResizeHandle({
  direction,
  onDrag,
}: {
  direction: "horizontal" | "vertical";
  onDrag: (deltaPx: number) => void;
}) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  return (
    <div
      onPointerDown={(e) => {
        dragging.current = true;
        lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const pos = direction === "horizontal" ? e.clientX : e.clientY;
        onDrag(pos - lastPos.current);
        lastPos.current = pos;
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      className={
        direction === "horizontal"
          ? "group flex w-6 shrink-0 touch-none select-none items-center justify-center cursor-col-resize"
          : "group mt-2 flex h-6 w-full touch-none select-none items-center justify-center cursor-row-resize"
      }
    >
      <div
        className={
          direction === "horizontal"
            ? "h-8 w-1 rounded-full bg-neutral-300 group-hover:bg-neutral-500"
            : "h-1 w-8 rounded-full bg-neutral-300 group-hover:bg-neutral-500"
        }
      />
    </div>
  );
}

// One row of 2+ side-by-side blocks, with its own resize handles — a
// vertical handle between each pair of blocks (drags their `width`
// weights relative to each other) and a horizontal handle along the
// row's bottom edge (drags the row's own `rowHeight`, in px). Pulled
// out from the main map() below since it needs its own ref (to measure
// the row's rendered size for the drag math) and drag-start baseline.
// This handle is structurally independent of what's inside each
// block — it doesn't read or depend on any block's own content or
// rendering, only on `containerRef`'s measured size — so it can't be
// broken by a block-content change the way the resize regression was.
function RowGroup({
  group,
  groupIndex,
  groupsLength,
  artistId,
  siteId,
  updateBlock,
  removeBlock,
  moveGroup,
  adjustRowWidths,
  adjustRowHeight,
}: {
  group: ContentBlock[];
  groupIndex: number;
  groupsLength: number;
  artistId: string;
  siteId: string;
  updateBlock: (id: string, patch: Partial<ContentBlock>) => void;
  removeBlock: (id: string) => void;
  moveGroup: (groupIndex: number, direction: -1 | 1) => void;
  adjustRowWidths: (leftId: string, rightId: string, deltaPx: number, containerWidth: number) => void;
  adjustRowHeight: (blockIds: string[], deltaPx: number, naturalHeightFallback: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowHeight = group[0].rowHeight;
  const blockIds = group.map((b) => b.id);

  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Row · {group.length} blocks side by side
        </span>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <button
            type="button"
            onClick={() => moveGroup(groupIndex, -1)}
            disabled={groupIndex === 0}
            className="hover:text-neutral-900 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => moveGroup(groupIndex, 1)}
            disabled={groupIndex === groupsLength - 1}
            className="hover:text-neutral-900 disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {/* overflow-hidden when a height is set (2026-09-04 bug fix) —
          keeps this box's visual size matching its layout size, same
          reasoning as the matching fix in LiveBlockPreview/
          BlockRenderer, so the editor's own box doesn't silently grow
          past what you actually set. */}
      <div
        ref={containerRef}
        className={`grid items-stretch ${rowHeight ? "overflow-hidden" : ""}`}
        style={{
          gridTemplateColumns: group.map((b) => `${b.width ?? 1}fr`).join(" "),
          height: rowHeight ? `${rowHeight}px` : undefined,
        }}
      >
        {group.map((block, i) => (
          <div key={block.id} className="flex min-w-0 items-stretch">
            <div className="flex min-w-0 flex-1 flex-col overflow-auto rounded-lg border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {block.type}
                </span>
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
              <BlockFields
                block={block}
                artistId={artistId}
                siteId={siteId}
                updateBlock={updateBlock}
                fill={Boolean(rowHeight)}
              />
            </div>
            {i < group.length - 1 && (
              <ResizeHandle
                direction="horizontal"
                onDrag={(deltaPx) =>
                  adjustRowWidths(
                    block.id,
                    group[i + 1].id,
                    deltaPx,
                    containerRef.current?.getBoundingClientRect().width || 400
                  )
                }
              />
            )}
          </div>
        ))}
      </div>

      <ResizeHandle
        direction="vertical"
        onDrag={(deltaPx) =>
          adjustRowHeight(blockIds, deltaPx, containerRef.current?.getBoundingClientRect().height || 300)
        }
      />
    </div>
  );
}

export default function PageEditor({
  siteId,
  artistId,
  pageId,
  pageTitle,
  initialBlocks,
  initialBackgroundColor,
  initialBackgroundImageId,
  initialBackgroundImageUrl,
}: {
  siteId: string;
  artistId: string;
  pageId: string;
  pageTitle: string;
  initialBlocks: ContentBlock[];
  initialBackgroundColor?: string | null;
  initialBackgroundImageId?: string | null;
  initialBackgroundImageUrl?: string | null;
}) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(initialBlocks);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isDeleting, setIsDeleting] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Page-level background — separate state and its own debounced save
  // effect below, since these persist to real Page columns
  // (backgroundColor/backgroundImageId) via updatePageBackground, not
  // to draftBlocks like `blocks` above.
  const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor || "");
  const [backgroundImageId, setBackgroundImageId] = useState(initialBackgroundImageId || "");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(initialBackgroundImageUrl || "");
  const [bgSaveState, setBgSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const isBgFirstRun = useRef(true);
  const bgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Side-by-side placement (2026-09-03) — a one-shot toggle: pick
  // "left"/"right", then the next block you add pairs with the last
  // block on the page instead of stacking below it. Resets to "none"
  // straight after that one add, same as a keyboard modifier key.
  const [placementMode, setPlacementMode] = useState<"none" | "left" | "right">("none");

  const handleRenamePage = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === pageTitle) return;
    const fd = new FormData();
    fd.set("title", trimmed);
    updatePageTitle(pageId, siteId, fd).then(() => {
      router.refresh();
      setTitleSaved(true);
      setTimeout(() => setTitleSaved(false), 1500);
    });
  };

  const handleDeletePage = async () => {
    setIsDeleting(true);
    const menuCount = await menuItemCountForPage(pageId);
    const warning =
      menuCount > 0
        ? `"${pageTitle}" is used in ${menuCount} menu placement${
            menuCount === 1 ? "" : "s"
          } — deleting it will remove those too. `
        : "";
    if (!confirm(`${warning}Delete "${pageTitle}"? This can't be undone.`)) {
      setIsDeleting(false);
      return;
    }
    await deletePage(siteId, pageId);
  };

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveDraftBlocks(pageId, blocks);
      setSaveState("saved");
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  useEffect(() => {
    if (isBgFirstRun.current) {
      isBgFirstRun.current = false;
      return;
    }
    setBgSaveState("saving");
    if (bgDebounceRef.current) clearTimeout(bgDebounceRef.current);
    bgDebounceRef.current = setTimeout(async () => {
      await updatePageBackground(pageId, {
        backgroundColor: backgroundColor || null,
        backgroundImageId: backgroundImageId || null,
      });
      setBgSaveState("saved");
    }, 700);
    return () => {
      if (bgDebounceRef.current) clearTimeout(bgDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundColor, backgroundImageId]);

  const buildBlock = (type: ContentBlock["type"]): ContentBlock => {
    const id = crypto.randomUUID();
    switch (type) {
      case "header":
        return { id, type: "header", text: "" };
      case "text":
        return { id, type: "text", text: "" };
      case "image":
        return { id, type: "image", imageId: "", url: "", caption: "" };
      case "gallery":
        return { id, type: "gallery", images: [] };
      case "artwork":
        return { id, type: "artwork", artworkId: "" };
      case "video":
        return { id, type: "video", imageId: "", url: "" };
      case "textgrid":
        return {
          id,
          type: "textgrid",
          columns: ["Year", "Exhibition", "Location"],
          rows: [{ id: crypto.randomUUID(), cell1: "", cell2: "", cell3: "" }],
        };
    }
  };

  // `placement` pairs the new block with the last block on the page
  // (side by side) instead of appending it full-width below — see
  // placementMode above. Both blocks in the pair are given/kept the
  // same `row` id; groupBlocksByRow (lib/blocks.ts) is what actually
  // turns that into a rendered row everywhere the page is shown.
  const addBlock = (type: ContentBlock["type"], placement: "none" | "left" | "right" = "none") => {
    const newBlock = buildBlock(type);

    setBlocks((prev) => {
      if (placement === "none" || prev.length === 0) {
        return [...prev, newBlock];
      }

      const groups = groupBlocksByRow(prev);
      const lastGroup = groups[groups.length - 1];
      const rowId = lastGroup[0].row || crypto.randomUUID();
      const lastGroupIds = new Set(lastGroup.map((b) => b.id));

      const withRowId = prev.map((b) =>
        lastGroupIds.has(b.id) ? ({ ...b, row: rowId } as ContentBlock) : b
      );
      const pairedBlock = { ...newBlock, row: rowId } as ContentBlock;

      const insertAt =
        placement === "right"
          ? withRowId.findIndex((b) => b.id === lastGroup[lastGroup.length - 1].id) + 1
          : withRowId.findIndex((b) => b.id === lastGroup[0].id);

      return [...withRowId.slice(0, insertAt), pairedBlock, ...withRowId.slice(insertAt)];
    });
  };

  const handleAddBlockClick = (type: ContentBlock["type"]) => {
    addBlock(type, placementMode);
    setPlacementMode("none");
  };

  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, ...patch } as ContentBlock) : b))
    );
  };

  // Removing a block from a row that leaves exactly one block behind
  // (2026-09-04, direct request) resets that leftover block back to
  // natural full-width — clearing `row`/`width`/`rowHeight` rather than
  // leaving it sized as if it still had a partner, or a row wrapper
  // with nothing to divide space with.
  const removeBlock = (id: string) => {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      const groups = groupBlocksByRow(next);
      return next.map((b) => {
        const stillGrouped = groups.some((g) => g.length > 1 && g.some((gb) => gb.id === b.id));
        if (!stillGrouped && b.row) {
          const { row, width, rowHeight, ...rest } = b;
          return rest as ContentBlock;
        }
        return b;
      });
    });
  };

  // Moves a whole row (1 or more blocks) up/down past its neighbouring
  // row, keeping every row's own blocks contiguous and together.
  const moveGroup = (groupIndex: number, direction: -1 | 1) => {
    setBlocks((prev) => {
      const groups = groupBlocksByRow(prev);
      const targetIndex = groupIndex + direction;
      if (targetIndex < 0 || targetIndex >= groups.length) return prev;
      const a = Math.min(groupIndex, targetIndex);
      const before = groups.slice(0, a).flat();
      const after = groups.slice(a + 2).flat();
      const [first, second] = [groups[a], groups[a + 1]];
      return [...before, ...second, ...first, ...after];
    });
  };

  // Resize sliders (2026-09-04). Both read the *current* state on every
  // call rather than a captured drag-start snapshot — pointer events
  // fire once per pixel of movement, so each call just needs to nudge
  // the previous value by that pixel's delta; over a whole drag this
  // converges to the same result as computing from a fixed start point,
  // without RowGroup needing to track its own running total.

  // Converts the dragged pixel distance into a change in the two
  // blocks' relative width *weights* (not px directly), so the ratio
  // keeps making sense at any container width.
  const adjustRowWidths = (
    leftId: string,
    rightId: string,
    deltaPx: number,
    containerWidth: number
  ) => {
    setBlocks((prev) => {
      const left = prev.find((b) => b.id === leftId);
      const right = prev.find((b) => b.id === rightId);
      if (!left || !right) return prev;
      const leftWidth = left.width ?? 1;
      const rightWidth = right.width ?? 1;
      const deltaWeight = (deltaPx / containerWidth) * (leftWidth + rightWidth);
      const newLeft = Math.max(0.2, leftWidth + deltaWeight);
      const newRight = Math.max(0.2, rightWidth - deltaWeight);
      return prev.map((b) => {
        if (b.id === leftId) return { ...b, width: newLeft } as ContentBlock;
        if (b.id === rightId) return { ...b, width: newRight } as ContentBlock;
        return b;
      });
    });
  };

  // `naturalHeightFallback` (the row's currently-rendered height) only
  // matters the very first time this row is resized, before any block
  // in it has a `rowHeight` yet — after that, the stored value is used.
  const adjustRowHeight = (blockIds: string[], deltaPx: number, naturalHeightFallback: number) => {
    setBlocks((prev) => {
      const current = prev.find((b) => blockIds.includes(b.id))?.rowHeight ?? naturalHeightFallback;
      const next = Math.min(900, Math.max(60, current + deltaPx));
      return prev.map((b) =>
        blockIds.includes(b.id) ? ({ ...b, rowHeight: next } as ContentBlock) : b
      );
    });
  };

  const groups = groupBlocksByRow(blocks);

  return (
    <ThreeColumnShell
      preview={
        <LiveBlockPreview
          blocks={blocks}
          backgroundColor={backgroundColor}
          backgroundImageUrl={backgroundImageUrl}
        />
      }
      edit={
        <div className="space-y-4">
          {groups.map((group, groupIndex) =>
            group.length > 1 ? (
              <RowGroup
                key={group[0].id}
                group={group}
                groupIndex={groupIndex}
                groupsLength={groups.length}
                artistId={artistId}
                siteId={siteId}
                updateBlock={updateBlock}
                removeBlock={removeBlock}
                moveGroup={moveGroup}
                adjustRowWidths={adjustRowWidths}
                adjustRowHeight={adjustRowHeight}
              />
            ) : (
              <div key={group[0].id} className="rounded-lg border border-neutral-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {group[0].type}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <button
                      type="button"
                      onClick={() => moveGroup(groupIndex, -1)}
                      disabled={groupIndex === 0}
                      className="hover:text-neutral-900 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveGroup(groupIndex, 1)}
                      disabled={groupIndex === groups.length - 1}
                      className="hover:text-neutral-900 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(group[0].id)}
                      className="text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <BlockFields
                  block={group[0]}
                  artistId={artistId}
                  siteId={siteId}
                  updateBlock={updateBlock}
                />
              </div>
            )
          )}
        </div>
      }
      menu={
        <div className="space-y-6">
          <div>
            <input
              type="text"
              defaultValue={pageTitle}
              onBlur={(e) => handleRenamePage(e.target.value)}
              className="w-full rounded-md border border-transparent px-1 py-0.5 -mx-1 text-lg font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300"
            />
            {titleSaved && <p className="mt-1 text-xs text-green-600">Saved</p>}
          </div>

          {/* Page-level controls — Add Header is a content block (see
              below), while background colour/image are real Page
              columns with their own debounced save effect above. */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => addBlock("header")}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
            >
              + Add Header
            </button>

            {backgroundColor ? (
              <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
                />
                <span className="flex-1 text-sm text-neutral-700">{backgroundColor}</span>
                <button
                  type="button"
                  onClick={() => setBackgroundColor("")}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBackgroundColor("#ffffff")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Add background colour
              </button>
            )}

            {backgroundImageUrl ? (
              <div className="rounded-md border border-neutral-300 p-2">
                <img
                  src={backgroundImageUrl}
                  alt=""
                  className="mb-2 h-20 w-full rounded object-cover"
                />
                <div className="flex items-center justify-between">
                  <div className="w-28">
                    <MediaPicker
                      artistId={artistId}
                      siteId={siteId}
                      mode="single"
                      label="Change"
                      onSelect={(imgs) => {
                        setBackgroundImageId(imgs[0].id);
                        setBackgroundImageUrl(imgs[0].url);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBackgroundImageId("");
                      setBackgroundImageUrl("");
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <MediaPicker
                artistId={artistId}
                siteId={siteId}
                mode="single"
                label="+ Add background Image"
                onSelect={(imgs) => {
                  setBackgroundImageId(imgs[0].id);
                  setBackgroundImageUrl(imgs[0].url);
                }}
              />
            )}
            <p className="text-xs text-neutral-400">
              {bgSaveState === "saving" ? "Saving…" : bgSaveState === "saved" ? "Saved" : ""}
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Add block
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={blocks.length === 0}
                  onClick={() =>
                    setPlacementMode((m) => (m === "left" ? "none" : "left"))
                  }
                  className={`rounded-md border px-2 py-1 text-xs disabled:opacity-30 ${
                    placementMode === "left"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  To left
                </button>
                <button
                  type="button"
                  disabled={blocks.length === 0}
                  onClick={() =>
                    setPlacementMode((m) => (m === "right" ? "none" : "right"))
                  }
                  className={`rounded-md border px-2 py-1 text-xs disabled:opacity-30 ${
                    placementMode === "right"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  To Right
                </button>
              </div>
            </div>
            {placementMode !== "none" && (
              <p className="mb-2 text-xs text-amber-600">
                The next block you add will sit to the {placementMode} of the last block,
                side by side.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleAddBlockClick("text")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Text
              </button>
              <button
                type="button"
                onClick={() => handleAddBlockClick("image")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Single Image
              </button>
              <button
                type="button"
                onClick={() => handleAddBlockClick("gallery")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Gallery
              </button>
              <button
                type="button"
                onClick={() => handleAddBlockClick("artwork")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Artwork Feature
              </button>
              <button
                type="button"
                onClick={() => handleAddBlockClick("video")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Video
              </button>
              <button
                type="button"
                onClick={() => handleAddBlockClick("textgrid")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Text Grid
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-neutral-400">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
            </p>
            <Link
              href={`/sites/${siteId}/pages/${pageId}/preview`}
              target="_blank"
              className="mt-2 block rounded-md border border-neutral-300 px-3 py-1.5 text-center text-sm hover:bg-neutral-50"
            >
              Open full preview
            </Link>

            <button
              type="button"
              onClick={handleDeletePage}
              disabled={isDeleting}
              className="mt-4 block w-full rounded-md border border-red-200 px-3 py-1.5 text-center text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete Page
            </button>
          </div>
        </div>
      }
    />
  );
}
