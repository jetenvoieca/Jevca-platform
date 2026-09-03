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

  const addBlock = (type: ContentBlock["type"]) => {
    const id = crypto.randomUUID();
    let newBlock: ContentBlock;
    switch (type) {
      case "header":
        newBlock = { id, type: "header", text: "" };
        break;
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
      case "textgrid":
        newBlock = {
          id,
          type: "textgrid",
          columns: ["Year", "Exhibition", "Location"],
          rows: [{ id: crypto.randomUUID(), cell1: "", cell2: "", cell3: "" }],
        };
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
      preview={
        <LiveBlockPreview
          blocks={blocks}
          backgroundColor={backgroundColor}
          backgroundImageUrl={backgroundImageUrl}
        />
      }
      edit={
        <div>
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

                {block.type === "header" && (
                  <input
                    type="text"
                    value={block.text}
                    onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                    placeholder="Page heading…"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-lg font-semibold"
                  />
                )}

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
                    <div className="w-32">
                      <MediaPicker
                        artistId={artistId}
                        siteId={siteId}
                        mode="single"
                        label={block.url ? "Change Image" : "Add Image"}
                        onSelect={(imgs) =>
                          updateBlock(block.id, { imageId: imgs[0].id, url: imgs[0].url })
                        }
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
                )}

                {block.type === "gallery" && (
                  <div className="grid grid-cols-4 gap-2">
                    {block.images.map((img) => (
                      <div key={img.imageId} className="group relative">
                        <img
                          src={img.url}
                          alt=""
                          className="aspect-square w-full rounded object-cover"
                        />
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
                        poster={block.posterUrl}
                        controls
                        className="mb-2 max-h-48 w-full rounded-md"
                      />
                    )}
                    <div className="w-32">
                      <MediaPicker
                        artistId={artistId}
                        siteId={siteId}
                        mode="single"
                        videoOnly
                        label={block.url ? "Change Video" : "Add Video"}
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
                )}

                {block.type === "textgrid" && (
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
                              updateBlock(block.id, {
                                rows: block.rows.filter((r) => r.id !== row.id),
                              })
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
                          rows: [
                            ...block.rows,
                            { id: crypto.randomUUID(), cell1: "", cell2: "", cell3: "" },
                          ],
                        })
                      }
                      className="mt-2 rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                    >
                      + Add Row
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
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
                <img src={backgroundImageUrl} alt="" className="mb-2 h-20 w-full rounded object-cover" />
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
              <button
                type="button"
                onClick={() => addBlock("textgrid")}
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
