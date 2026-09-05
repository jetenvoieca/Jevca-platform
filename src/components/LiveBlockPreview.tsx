"use client";

import type { ContentBlock } from "@/lib/blocks";
import { groupBlocksByRow } from "@/lib/blocks";
import { getPlainMediaSizing, type MediaSizeMode } from "@/lib/blockMedia";

// Image/Video/Gallery sizing comes from getPlainMediaSizing in
// @/lib/blockMedia (2026-09-05 redesign) — the same function
// BlockRenderer.tsx and PageEditor.tsx's MediaPicker calls use, so this
// mini preview, the full /preview page, and the editor itself can never
// visually disagree about how big a media box is. See blockMedia.ts for
// the full rationale (this replaces an earlier `fill` boolean + inline
// className ternary that were hand-copied across all three files).
function renderBlock(block: ContentBlock, mode: MediaSizeMode) {
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
    if (!block.url) return null;
    const media = getPlainMediaSizing(mode);
    return (
      <figure key={block.id} className={mode.kind === "row" ? "h-full" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.caption || ""} className={media.className} style={media.style} />
        {block.caption && (
          <figcaption className="mt-1 text-xs text-neutral-500">{block.caption}</figcaption>
        )}
      </figure>
    );
  }
  if (block.type === "gallery") {
    if (block.images.length === 0) return null;
    const media = getPlainMediaSizing(mode);
    return (
      <div key={block.id} className={`grid grid-cols-2 gap-2 ${mode.kind === "row" ? "h-full" : ""}`}>
        {block.images.map((img) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={img.imageId} src={img.url} alt="" className={media.className} style={media.style} />
        ))}
      </div>
    );
  }
  if (block.type === "video") {
    if (!block.url) return null;
    const media = getPlainMediaSizing(mode);
    return (
      <video key={block.id} src={block.url} controls className={media.className} style={media.style} />
    );
  }
  if (block.type === "artwork") {
    if (!block.previewTitle) return null;
    return (
      <div key={block.id} className="flex gap-3 rounded-md border border-neutral-200 p-3">
        {block.previewImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
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
          if (group.length === 1) return renderBlock(group[0], { kind: "natural" });
          const rowHeight = group[0].rowHeight;
          const mode: MediaSizeMode = rowHeight ? { kind: "row", rowHeightPx: rowHeight } : { kind: "natural" };
          return (
            // overflow-hidden when a height has been set (2026-09-04
            // bug fix) — without it, content taller than the chosen
            // height painted past the row's laid-out box. Clipping
            // keeps the row's visual size and its layout size the
            // same, matching how the width handle already crops rather
            // than overflows. This row has no header chrome (unlike
            // the editor's own card), so forcing its total height to
            // exactly rowHeight is correct here — see PageEditor.tsx's
            // RowGroup for why the editor itself no longer does this.
            //
            // gridTemplateColumns uses minmax(0, Xfr), not bare `Xfr`
            // (2026-09-04 bug fix, matching PageEditor's RowGroup) — a
            // bare `fr` track still respects its content's min-content
            // width by default, which could keep a column from truly
            // reaching a small share even though the ratio was
            // correct.
            <div
              key={group[0].id}
              className={`grid items-stretch gap-4 ${rowHeight ? "overflow-hidden" : ""}`}
              style={{
                gridTemplateColumns: group.map((b) => `minmax(0, ${b.width ?? 1}fr)`).join(" "),
                height: rowHeight ? `${rowHeight}px` : undefined,
              }}
            >
              {group.map((block) => renderBlock(block, mode))}
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
