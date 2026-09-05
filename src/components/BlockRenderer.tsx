import type { ContentBlock } from "@/lib/blocks";
import { groupBlocksByRow } from "@/lib/blocks";
import { getPlainMediaSizing, type MediaSizeMode } from "@/lib/blockMedia";

type ArtworkData = {
  id: string;
  presentationTitle: string;
  presentationPrice: unknown;
  availability: string;
  images: { url: string }[];
};

// Image/Video/Gallery sizing comes from getPlainMediaSizing in
// @/lib/blockMedia (2026-09-05 redesign) — the same function
// LiveBlockPreview.tsx and PageEditor.tsx's MediaPicker calls use, so
// this full-size preview, the editor's mini preview, and the editor
// itself can never visually disagree about how big a media box is. See
// blockMedia.ts for the full rationale (this replaces an earlier `fill`
// boolean + inline className ternary that were hand-copied across all
// three files, and had drifted out of sync twice).
function renderBlock(block: ContentBlock, artworks: ArtworkData[], mode: MediaSizeMode) {
  if (block.type === "header") {
    return block.text ? (
      <h1 key={block.id} className="text-3xl font-semibold text-neutral-900">
        {block.text}
      </h1>
    ) : null;
  }
  if (block.type === "text") {
    return (
      <p key={block.id} className="whitespace-pre-wrap text-neutral-800">
        {block.text}
      </p>
    );
  }
  if (block.type === "image") {
    if (!block.url) return null;
    const media = getPlainMediaSizing(mode);
    return (
      <figure key={block.id} className={mode.kind === "row" ? "h-full" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.caption || ""} className={media.className} style={media.style} />
        {block.caption && (
          <figcaption className="mt-1 text-sm text-neutral-500">{block.caption}</figcaption>
        )}
      </figure>
    );
  }
  if (block.type === "gallery") {
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
    const artwork = artworks.find((a) => a.id === block.artworkId);
    if (!artwork) return null;
    return (
      <div key={block.id} className="flex gap-4 rounded-md border border-neutral-200 p-4">
        {artwork.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artwork.images[0].url} alt="" className="h-32 w-32 rounded object-cover" />
        )}
        <div>
          <h3 className="font-medium text-neutral-900">{artwork.presentationTitle}</h3>
          {artwork.presentationPrice != null && (
            <p className="text-sm text-neutral-600">£{String(artwork.presentationPrice)}</p>
          )}
          <p className="text-xs uppercase text-neutral-400">{artwork.availability}</p>
        </div>
      </div>
    );
  }
  if (block.type === "textgrid") {
    const rows = block.rows.filter((r) => r.cell1 || r.cell2 || r.cell3);
    if (rows.length === 0) return null;
    return (
      <table key={block.id} className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-300">
            {block.columns.map((col, i) => (
              <th key={i} className="py-2 pr-4 font-medium text-neutral-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 text-neutral-800">{row.cell1}</td>
              <td className="py-2 pr-4 text-neutral-800">{row.cell2}</td>
              <td className="py-2 pr-4 text-neutral-800">{row.cell3}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

export default function BlockRenderer({
  blocks,
  artworks,
}: {
  blocks: ContentBlock[];
  artworks: ArtworkData[];
}) {
  const groups = groupBlocksByRow(blocks);

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        if (group.length === 1) return renderBlock(group[0], artworks, { kind: "natural" });
        const rowHeight = group[0].rowHeight;
        const mode: MediaSizeMode = rowHeight ? { kind: "row", rowHeightPx: rowHeight } : { kind: "natural" };
        return (
          // See the matching note in LiveBlockPreview.tsx — clipping
          // only when a height is actually set, and minmax(0, Xfr) so
          // this renderer can't drift out of sync with the editor or
          // LiveBlockPreview.
          <div
            key={group[0].id}
            className={`grid items-stretch gap-6 ${rowHeight ? "overflow-hidden" : ""}`}
            style={{
              gridTemplateColumns: group.map((b) => `minmax(0, ${b.width ?? 1}fr)`).join(" "),
              height: rowHeight ? `${rowHeight}px` : undefined,
            }}
          >
            {group.map((block) => renderBlock(block, artworks, mode))}
          </div>
        );
      })}
    </div>
  );
}
