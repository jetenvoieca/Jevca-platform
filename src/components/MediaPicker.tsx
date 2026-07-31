"use client";

import { useState, useTransition, useRef } from "react";
import { listImages, uploadImage } from "@/lib/actions/media";

type PickedImage = { id: string; url: string; caption: string | null; kind: string };

export default function MediaPicker({
  artistId,
  mode = "single",
  videoOnly = false,
  label = "Choose Image",
  onSelect,
}: {
  artistId: string;
  mode?: "single" | "multi";
  videoOnly?: boolean;
  label?: string;
  onSelect: (images: PickedImage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);
  const [selected, setSelected] = useState<PickedImage[]>([]);
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = (q: string) => {
    startTransition(async () => {
      const results = await listImages(artistId, q || undefined);
      setImages(
        results
          .filter((img) => (videoOnly ? img.kind === "VIDEO" : img.kind === "PHOTO"))
          .map((img) => ({ id: img.id, url: img.url, caption: img.caption, kind: img.kind }))
      );
    });
  };

  const handleOpen = () => {
    setOpen(true);
    setSelected([]);
    load(query);
  };

  const handleUpload = (file: File) => {
    setUploadError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadImage(artistId, formData);
      if (result.error) {
        setUploadError(result.error);
        return;
      }
      if (result.image) {
        const img = {
          id: result.image.id,
          url: result.image.url,
          caption: result.image.caption,
          kind: result.image.kind,
        };
        setImages((prev) => [...prev, img]);
        handlePick(img);
      }
    });
  };

  const handlePick = (img: PickedImage) => {
    if (mode === "single") {
      onSelect([img]);
      setOpen(false);
    } else {
      setSelected((prev) =>
        prev.some((p) => p.id === img.id)
          ? prev.filter((p) => p.id !== img.id)
          : [...prev, img]
      );
    }
  };

  const confirmMulti = () => {
    onSelect(selected);
    setSelected([]);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-neutral-200 p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              load(e.target.value);
            }}
            placeholder={videoOnly ? "Search videos…" : "Search images…"}
            autoFocus
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            {isPending ? "Uploading…" : "Upload new"}
            <input
              ref={fileInputRef}
              type="file"
              accept={videoOnly ? "video/*" : "image/*"}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        {uploadError && (
          <p className="border-b border-neutral-200 bg-red-50 px-4 py-2 text-xs text-red-600">
            {uploadError}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-6 gap-3">
            {images.map((img) => {
              const isSelected = selected.some((s) => s.id === img.id);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handlePick(img)}
                  className={`overflow-hidden rounded-md border-2 ${
                    isSelected ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                  }`}
                >
                  {img.kind === "VIDEO" ? (
                    <div className="flex aspect-square w-full items-center justify-center bg-neutral-200 text-xs text-neutral-500">
                      Video
                    </div>
                  ) : (
                    <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
          {images.length === 0 && (
            <p className="py-12 text-center text-sm text-neutral-400">
              No matches. Upload one above.
            </p>
          )}
        </div>

        {mode === "multi" && (
          <div className="flex items-center justify-between border-t border-neutral-200 p-4">
            <span className="text-sm text-neutral-500">{selected.length} selected</span>
            <button
              type="button"
              onClick={confirmMulti}
              disabled={selected.length === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Add to gallery
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
