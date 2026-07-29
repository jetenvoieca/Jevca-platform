"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateArtwork,
  deleteArtwork,
  linkImagesToArtwork,
  unlinkImageFromArtwork,
} from "@/lib/actions/artworks";
import MediaPicker from "@/components/MediaPicker";
import ThreeColumnShell from "@/components/ThreeColumnShell";

type ArtworkData = {
  id: string;
  siteId: string;
  title: string;
  catalogueNumber: string;
  medium: string | null;
  dimensions: string | null;
  year: number | null;
  price: string | null;
  availability: string;
  visible: boolean;
  description: string | null;
  images: { id: string; url: string }[];
};

export default function ArtworkEditor({
  siteId,
  artwork,
}: {
  siteId: string;
  artwork: ArtworkData;
}) {
  const [images, setImages] = useState(artwork.images);
  const [title, setTitle] = useState(artwork.title);
  const [price, setPrice] = useState(artwork.price || "");
  const [availability, setAvailability] = useState(artwork.availability);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm(`Delete "${artwork.title}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteArtwork(siteId, artwork.id);
    });
  };

  return (
    <ThreeColumnShell
      preview={
        <div>
          <p className="mb-4 text-xs uppercase tracking-wide text-neutral-400">Live preview</p>
          <div className="rounded-lg border border-neutral-200 p-4">
            {images[0] ? (
              <img src={images[0].url} alt="" className="mb-3 w-full rounded-md object-cover" />
            ) : (
              <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                No image
              </div>
            )}
            <h3 className="font-medium text-neutral-900">{title || "Untitled"}</h3>
            {price && <p className="text-sm text-neutral-600">£{price}</p>}
            <p className="text-xs uppercase text-neutral-400">{availability}</p>
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            This is how this artwork appears wherever it&apos;s featured on a page.
          </p>
        </div>
      }
      edit={
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-neutral-900">{artwork.title}</h2>
            <p className="text-sm text-neutral-500">Catalogue #{artwork.catalogueNumber}</p>
          </div>

          <form
            action={async (formData) => {
              await updateArtwork(artwork.id, formData);
              setSaved(true);
              router.refresh();
              setTimeout(() => setSaved(false), 2000);
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Title</label>
              <input
                type="text"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Medium</label>
                <input
                  type="text"
                  name="medium"
                  defaultValue={artwork.medium || ""}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Dimensions
                </label>
                <input
                  type="text"
                  name="dimensions"
                  defaultValue={artwork.dimensions || ""}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Year</label>
                <input
                  type="number"
                  name="year"
                  defaultValue={artwork.year ?? ""}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Price (£)
                </label>
                <input
                  type="text"
                  name="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 450.00"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Availability
                </label>
                <select
                  name="availability"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="SOLD">Sold</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  name="visible"
                  id="visible"
                  defaultChecked={artwork.visible}
                />
                <label htmlFor="visible" className="text-sm text-neutral-700">
                  Shown on public site
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Description
              </label>
              <textarea
                name="description"
                defaultValue={artwork.description || ""}
                rows={4}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Save
              </button>
              {saved && <span className="text-sm text-green-600">Saved</span>}
            </div>
          </form>

          <div className="mt-8 border-t border-neutral-200 pt-6">
            <h3 className="mb-2 text-sm font-medium text-neutral-700">Linked Images</h3>
            {images.length > 0 && (
              <div className="mb-2 grid grid-cols-4 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="group relative">
                    <img src={img.url} alt="" className="h-20 w-full rounded object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          await unlinkImageFromArtwork(artwork.id, img.id);
                          setImages((prev) => prev.filter((i) => i.id !== img.id));
                        });
                      }}
                      className="absolute right-0 top-0 hidden rounded-bl bg-black/60 px-1 text-xs text-white group-hover:block"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <MediaPicker
              siteId={siteId}
              mode="multi"
              label="Link Images"
              onSelect={(imgs) => {
                const ids = imgs.map((i) => i.id);
                startTransition(async () => {
                  await linkImagesToArtwork(artwork.id, ids);
                  setImages((prev) => [
                    ...prev,
                    ...imgs
                      .filter((img) => !prev.some((p) => p.id === img.id))
                      .map((img) => ({ id: img.id, url: img.url })),
                  ]);
                });
              }}
            />
          </div>
        </div>
      }
      menu={
        <div className="space-y-4">
          <Link
            href={`/sites/${siteId}/artworks`}
            className="block text-sm text-neutral-500 hover:underline"
          >
            ← Back to Artworks
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="w-full rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete artwork
          </button>
        </div>
      }
    />
  );
}
