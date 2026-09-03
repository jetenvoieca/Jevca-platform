"use client";

import type { ContentBlock } from "@/lib/blocks";
import { groupBlocksByRow } from "@/lib/blocks";

function renderBlock(block: ContentBlock) {
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
      <figure key={block.id}>
        <img src={block.url} alt={block.caption || ""} className="w-full rounded-md" />
        {block.caption && (
          <figcaption className="mt-1 text-xs text-neutral-500">{block.caption}</figcaption>
        )}
      </figure>
    ) : null;
  }
  if (block.type === "gallery") {
    return block.images.length > 0 ? (
      <div key={block.id} className="grid grid-cols-2 gap-2">
        {block.images.map((img) => (
          <img key={img.imageId} src={img.url} alt="" className="rounded-md" />
        ))}
      </div>
    ) : null;
  }
  if (block.type === "video") {
    return block.url ? (
      <video key={block.id} src={block.url} controls className="w-full rounded-md" />
    ) : null;
  }
  if (block.type === "artwork") {
    if (!block.previewTitle) return null;
    return (
      <div key={block.id} className="flex gap-3 rounded-md border border-neutral-200 p-3">
        {block.previewImageUrl ? (
          <img src={block.previewImageUrl} alt="" className="h-20 w-20 rounded object-cover" />
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
        {groups.map((group) =>
          group.length > 1 ? (
            <div
              key={group[0].id}
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${group.length}, minmax(0, 1fr))` }}
            >
              {group.map((block) => renderBlock(block))}
            </div>
          ) : (
            renderBlock(group[0])
          )
        )}
        {blocks.length === 0 && (
          <p className="text-sm text-neutral-400">Add a block to see it appear here.</p>
        )}
      </div>
    </div>
  );
}
