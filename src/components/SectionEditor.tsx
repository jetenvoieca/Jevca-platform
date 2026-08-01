"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveDraftBlocks, deletePage, menuItemCountForPage, updatePageTitle } from "@/lib/actions/pages";
import ThreeColumnShell from "@/components/ThreeColumnShell";
import ArtworkPicker from "@/components/ArtworkPicker";
import SectionGrid, { type SectionArtworkTile } from "@/components/SectionGrid";

export default function SectionEditor({
  siteId,
  artistId,
  pageId,
  pageTitle,
  initialByline,
  initialArtworks,
}: {
  siteId: string;
  artistId: string;
  pageId: string;
  pageTitle: string;
  initialByline: string;
  initialArtworks: SectionArtworkTile[];
}) {
  const [byline, setByline] = useState(initialByline);
  const [artworks, setArtworks] = useState<SectionArtworkTile[]>(initialArtworks);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isDeleting, setIsDeleting] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const isFirstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveState("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveDraftBlocks(pageId, { byline, artworkIds: artworks.map((a) => a.id) });
      setSaveState("saved");
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byline, artworks]);

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

  const addArtworks = (
    picked: {
      id: string;
      presentationTitle: string;
      imageUrl: string | null;
      presentationPrice: string | null;
    }[]
  ) => {
    setArtworks((prev) => [
      ...prev,
      ...picked.filter((a) => !prev.some((p) => p.id === a.id)),
    ]);
  };

  const removeArtwork = (id: string) => {
    setArtworks((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setArtworks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  return (
    <ThreeColumnShell
      preview={<SectionGrid title={pageTitle} byline={byline} artworks={artworks} />}
      edit={
        <div>
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-neutral-700">Byline</label>
            <textarea
              value={byline}
              onChange={(e) => setByline(e.target.value)}
              placeholder="A short line under the title…"
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="mb-3">
            <label className="text-sm font-medium text-neutral-700">Artworks</label>
          </div>

          {artworks.length === 0 ? (
            <p className="mb-3 text-sm text-neutral-400">
              Use the tile below to add artworks, then drag to reorder.
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {artworks.map((a, i) => (
              <div
                key={a.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => setDragIndex(null)}
                className={`group relative cursor-move rounded-md border-2 p-1 ${
                  dragIndex === i ? "border-neutral-900 opacity-50" : "border-transparent"
                }`}
              >
                {a.imageUrl ? (
                  <img
                    src={a.imageUrl}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                    No image
                  </div>
                )}
                <p className="mt-1 truncate text-xs font-medium text-neutral-900">
                  {a.presentationTitle}
                </p>
                <button
                  type="button"
                  onClick={() => removeArtwork(a.id)}
                  className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
                >
                  ✕
                </button>
              </div>
            ))}
            <ArtworkPicker artistId={artistId} mode="multi" label="Add Artwork" onSelect={addArtworks} />
          </div>
          <p className="mt-2 text-xs text-neutral-400">Drag a tile to reorder.</p>
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
