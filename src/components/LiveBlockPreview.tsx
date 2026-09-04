"use client";

import type { ContentBlock } from "@/lib/blocks";
import { groupBlocksByRow } from "@/lib/blocks";

// `fill` — true when this block is rendered inside a row that has an
// explicit rowHeight (2026-09-04). Media then scales to fit within
// that height (object-contain, whole image visible) rather than being
// cropped — resizing a row shrinks the picture, it doesn't cut pieces
// off it. No backdrop colour behind the letterboxing (2026-09-04 fix):
// the box is transparent, so the page's own background colour/image
// shows through continuously instead of a fixed grey patch breaking
// it up. Anchored top-left (object-left-top) rather than centred, so
// the image doesn't visually drift as you drag a resize handle — the
// top-left corner stays put and only the bottom/right edge moves.
//
// A full-width block with no row (`fill` false) gets its own cap —
// max-h-[520px] with object-cover — so a portrait-oriented image
// doesn't render at its full, potentially very tall, natural height
// and end up looking oddly slim/elongated at typical preview widths.
function renderBlock(block: ContentBlock, fill: boolean) {
  if (block.type === "header") {
    return block.text ? (
      <h1 key={block.id} className="text-2xl font-semibold text-neutral-900">
        {block.text}
      </h1>
    ) : null;
  }
  if (block.type === "text") {
    return block.text ? (
      <p key={block.id} className="whitespace-pre-wrap text-sm text-neutral-800">
        {block.text}
      </p>
    ) : null;
  }
  if (block.type === "image") {
    return block.url ? (
      <figure key={block.id} className={fill ? "h-full" : undefined}>
        <img
          src={block.url}
          alt={block.caption || ""}
          className={
            fill
              ? "h-full w-full rounded-md object-contain object-left-top"
              : "max-h-[520px] w-full rounded-md object-cover"
          }
        />
        {block.caption && (
          <figcaption className="mt-1 text-xs text-neutral-500">{block.caption}</figcaption>
        )}
      </figure>
    ) : null;
  }
  if (block.type === "gallery") {
    return block.images.length > 0 ? (
      <div key={block.id} className={`grid grid-cols-2 gap-2 ${fill ? "h-full" : ""}`}>
        {block.images.map((img) => (
          <img
            key={img.imageId}
            src={img.url}
            alt=""
            className={
              fill ? "h-full w-full rounded-md object-contain object-left-top" : "rounded-md"
            }
          />
        ))}
      </div>
    ) : null;
  }
  if (block.type === "video") {
    return block.url ? (
      <video
        key={block.id}
        src={block.url}
        controls
        className={
          fill
            ? "h-full w-full rounded-md object-contain object-left-top"
            : "max-h-[520px] w-full rounded-md"
        }
      />
    ) : null;
  }
  if (block.type === "artwork") {
    if (!block.previewTitle) return null;
    return (
      <div key={block.id} className="flex gap-3 rounded-md border border-neutral-200 p-3">
        {block.previewImageUrl ? (
          <img
            src={block.previewImageUrl}
            alt=""
            className="h-20 w-20 rounded object-cover"
          />
        ) : (
          <div className="h-20 w-20 rounded bg-neutral-100" />
        )}
        <div>
          <h3 className="text-sm font-medium text-neutral-900">{block.previewTitle}</h3>
          {block.previewPrice && (
            <p className="text-xs text-neutral-600">£{block.previewPrice}</p>
          )}
          {block.previewAvailability && (
            <p className="text-xs uppercase text-neutral-400">{block.previewAvailability}</p>
          )}
        </div>
      </div>
    );
  }
  if (block.type === "textgrid") {
    const rows = block.rows.filter((r) => r.cell1 || r.cell2 || r.cell3);
    if (rows.length === 0) return null;
    return (
      <table key={block.id} className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-300">
            {block.columns.map((col, i) => (
              <th key={i} className="py-1.5 pr-3 font-medium text-neutral-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-100">
              <td className="py-1.5 pr-3 text-neutral-800">{row.cell1}</td>
              <td className="py-1.5 pr-3 text-neutral-800">{row.cell2}</td>
              <td className="py-1.5 pr-3 text-neutral-800">{row.cell3}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

export default function LiveBlockPreview({
  blocks,
  backgroundColor,
  backgroundImageUrl,
}: {
  blocks: ContentBlock[];
  backgroundColor?: string | null;
  backgroundImageUrl?: string | null;
}) {
  const groups = groupBlocksByRow(blocks);

  return (
    <div>
      <p className="mb-4 text-xs uppercase tracking-wide text-neutral-400">Live preview</p>
      <div
        className="space-y-6 rounded-md p-4 -m-4"
        style={{
          backgroundColor: backgroundColor || undefined,
          backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {groups.map((group) => {
          if (group.length === 1) return renderBlock(group[0], false);
          const rowHeight = group[0].rowHeight;
          return (
            // overflow-hidden when a height has been set (2026-09-04
            // bug fix) — without it, content taller than the chosen
            // height painted past the row's laid-out box: the box
            // itself (and the page background behind it) stayed at the
            // set height while the image visually spilled below it,
            // and the next row then started flowing right after that
            // too-short box, overlapping the spill. Clipping keeps the
            // row's visual size and its layout size the same, matching
            // how the width handle already crops rather than overflows.
            <div
              key={group[0].id}
              className={`grid items-stretch gap-4 ${rowHeight ? "overflow-hidden" : ""}`}
              style={{
                gridTemplateColumns: group.map((b) => `${b.width ?? 1}fr`).join(" "),
                height: rowHeight ? `${rowHeight}px` : undefined,
              }}
            >
              {group.map((block) => renderBlock(block, Boolean(rowHeight)))}
            </div>
          );
        })}
        {blocks.length === 0 && (
          <p className="text-sm text-neutral-400">Add a block to see it appear here.</p>
        )}
      </div>
    </div>
  );
}
