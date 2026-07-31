"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { saveDraftBlocks } from "@/lib/actions/pages";
import MediaPicker from "@/components/MediaPicker";
import ArtworkPicker from "@/components/ArtworkPicker";
import ThreeColumnShell from "@/components/ThreeColumnShell";
import LiveBlockPreview from "@/components/LiveBlockPreview";
import type { ContentBlock } from "@/lib/blocks";

export default function PageEditor({
  siteId,
  artistId,
  pageId,
  pageTitle,
  initialBlocks,
}: {
  siteId: string;
  artistId: string;
  pageId: string;
  pageTitle: string;
  initialBlocks: ContentBlock[];
}) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(initialBlocks);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const addBlock = (type: ContentBlock["type"]) => {
    const id = crypto.randomUUID();
    let newBlock: ContentBlock;
    switch (type) {
      case "text":
        newBlock = { id, type: "text", text: "" };
        break;
      case "image":
        newBlock = { id, type: "image", imageId: "", url: "", caption: "" };
        break;
      case "gallery":
        newBlock = { id, type: "gallery", images: [] };
        break;
      case "artwork":
        newBlock = { id, type: "artwork", artworkId: "" };
        break;
      case "video":
        newBlock = { id, type: "video", imageId: "", url: "" };
        break;
    }
    setBlocks((prev) => [...prev, newBlock]);
  };

  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, ...patch } as ContentBlock) : b))
    );
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  };

  return (
    <ThreeColumnShell
      preview={<LiveBlockPreview blocks={blocks} pageTitle={pageTitle} />}
      edit={
        <div>
          <h1 className="mb-6 text-2xl font-semibold text-neutral-900">{pageTitle}</h1>

          <div className="space-y-4">
            {blocks.map((block, i) => (
              <div key={block.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {block.type}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <button
                      type="button"
                      onClick={() => moveBlock(block.id, -1)}
                      disabled={i === 0}
                      className="hover:text-neutral-900 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(block.id, 1)}
                      disabled={i === blocks.length - 1}
                      className="hover:text-neutral-900 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {block.type === "text" && (
                  <textarea
                    value={block.text}
                    onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                    rows={4}
                    placeholder="Write something…"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                )}

                {block.type === "image" && (
                  <div>
                    {block.url && (
                      <img
                        src={block.url}
                        alt=""
                        className="mb-2 max-h-48 rounded-md object-cover"
                      />
                    )}
                    <MediaPicker
                      artistId={artistId}
                      mode="single"
                      label={block.url ? "Change Image" : "Choose Image"}
                      onSelect={(imgs) =>
                        updateBlock(block.id, { imageId: imgs[0].id, url: imgs[0].url })
                      }
                    />
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
                )}

                {block.type === "gallery" && (
                  <div>
                    {block.images.length > 0 && (
                      <div className="mb-2 grid grid-cols-4 gap-2">
                        {block.images.map((img) => (
                          <div key={img.imageId} className="group relative">
                            <img
                              src={img.url}
                              alt=""
                              className="h-16 w-full rounded object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, {
                                  images: block.images.filter(
                                    (i) => i.imageId !== img.imageId
                                  ),
                                })
                              }
                              className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 text-xs text-white group-hover:block"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <MediaPicker
                      artistId={artistId}
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
                )}

                {block.type === "artwork" && (
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
                    <ArtworkPicker
                      artistId={artistId}
                      onSelect={(a) =>
                        updateBlock(block.id, {
                          artworkId: a.id,
                          previewTitle: a.presentationTitle,
                          previewImageUrl: a.imageUrl || undefined,
                          previewPrice: a.presentationPrice,
                          previewAvailability: a.availability,
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-neutral-400">
                      Always shows the artwork&apos;s current title, image, price and status —
                      editing the artwork updates every page it appears on.
                    </p>
                  </div>
                )}

                {block.type === "video" && (
                  <div>
                    {block.url && (
                      <video
                        src={block.url}
                        controls
                        className="mb-2 max-h-48 w-full rounded-md"
                      />
                    )}
                    <MediaPicker
                      artistId={artistId}
                      mode="single"
                      videoOnly
                      label={block.url ? "Change Video" : "Choose Video"}
                      onSelect={(vids) =>
                        updateBlock(block.id, { imageId: vids[0].id, url: vids[0].url })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      }
      menu={
        <div className="space-y-6">
          <Link
            href={`/sites/${siteId}`}
            className="block text-sm text-neutral-500 hover:underline"
          >
            ← Back to Web Site
          </Link>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Add block
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => addBlock("text")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Text
              </button>
              <button
                type="button"
                onClick={() => addBlock("image")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Single Image
              </button>
              <button
                type="button"
                onClick={() => addBlock("gallery")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Gallery
              </button>
              <button
                type="button"
                onClick={() => addBlock("artwork")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Artwork Feature
              </button>
              <button
                type="button"
                onClick={() => addBlock("video")}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                + Video
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
          </div>
        </div>
      }
    />
  );
}
