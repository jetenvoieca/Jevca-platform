"use client";

import { useState, useTransition, useRef } from "react";
import { listImages, uploadImage } from "@/lib/actions/media";

type PickedImage = { id: string; url: string; caption: string | null; kind: string };

export default function MediaPicker({
  siteId,
  mode = "single",
  videoOnly = false,
  label = "Choose Image",
  onSelect,
}: {
  siteId: string;
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
      const results = await listImages(siteId, q || undefined);
      setImages(
        results
          .filter((img) => (videoOnly ? img.kind === "VIDEO" : img.kind === "PHOTO"))
          .map((img) => ({ id: img.id, url: img.url, caption: img.caption, kind: img.kind }))
      );
    });
  };

  const handleOpen = () => {
    setOpen(true);
    load(query);
  };

  const handleUpload = (file: File) => {
    setUploadError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadImage(siteId, formData);
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
        setImages((prev) => [img, ...prev]);
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
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            load(e.target.value);
          }}
          placeholder={videoOnly ? "Search videos…" : "Search images…"}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm hover:bg-neutral-50">
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
          className="text-sm text-neutral-500 hover:underline"
        >
          Close
        </button>
      </div>

      {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}

      <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto">
        {images.map((img) => {
          const isSelected = selected.some((s) => s.id === img.id);
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => handlePick(img)}
              className={`overflow-hidden rounded-md border-2 ${
                isSelected ? "border-neutral-900" : "border-transparent"
              }`}
            >
              {img.kind === "VIDEO" ? (
                <div className="flex h-16 w-full items-center justify-center bg-neutral-200 text-xs text-neutral-500">
                  Video
                </div>
              ) : (
                <img src={img.url} alt="" className="h-16 w-full object-cover" />
              )}
            </button>
          );
        })}
        {images.length === 0 && (
          <p className="col-span-4 py-4 text-center text-xs text-neutral-400">
            No matches. Upload one above.
          </p>
        )}
      </div>

      {mode === "multi" && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-neutral-500">{selected.length} selected</span>
          <button
            type="button"
            onClick={confirmMulti}
            disabled={selected.length === 0}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            Add to gallery
          </button>
        </div>
      )}
    </div>
  );
}
