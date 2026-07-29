"use client";

import type { ContentBlock } from "@/lib/blocks";

export default function LiveBlockPreview({
  blocks,
  pageTitle,
}: {
  blocks: ContentBlock[];
  pageTitle: string;
}) {
  return (
    <div>
      <p className="mb-4 text-xs uppercase tracking-wide text-neutral-400">Live preview</p>
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">{pageTitle}</h1>
      <div className="space-y-6">
        {blocks.map((block) => {
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
                  <figcaption className="mt-1 text-xs text-neutral-500">
                    {block.caption}
                  </figcaption>
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
                    <p className="text-xs uppercase text-neutral-400">
                      {block.previewAvailability}
                    </p>
                  )}
                </div>
              </div>
            );
          }
          return null;
        })}
        {blocks.length === 0 && (
          <p className="text-sm text-neutral-400">Add a block to see it appear here.</p>
        )}
      </div>
    </div>
  );
}
