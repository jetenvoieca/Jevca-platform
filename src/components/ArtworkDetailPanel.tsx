"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updatePresentation,
  updateCatalogue,
  deleteArtwork,
  linkImagesToArtwork,
  unlinkImageFromArtwork,
} from "@/lib/actions/artworks";
import MediaPicker from "@/components/MediaPicker";

export type ArtworkDetail = {
  id: string;
  siteId: string;
  catalogueNumber: string;
  presentationTitle: string;
  presentationPrice: string | null;
  dimensions: string | null;
  description: string | null;
  medium: string | null;
  presentationGroup: string | null;
  availability: string;
  visible: boolean;
  catalogueName: string;
  year: number | null;
  type: string | null;
  catalogueGroup: string | null;
  size: string | null;
  location: string | null;
  edition: string | null;
  availableQty: number | null;
  priceUnframed: string | null;
  priceFramed: string | null;
  studioNotes: string | null;
  images: { id: string; url: string }[];
};

export default function ArtworkDetailPanel({
  siteId,
  artwork,
}: {
  siteId: string;
  artwork: ArtworkDetail;
}) {
  const [tab, setTab] = useState<"presentation" | "catalogue">("presentation");
  const [images, setImages] = useState(artwork.images);
  const [isPending, startTransition] = useTransition();
  const [savedTab, setSavedTab] = useState<null | "presentation" | "catalogue">(null);
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm(`Delete "${artwork.presentationTitle}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteArtwork(siteId, artwork.id);
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">{artwork.presentationTitle}</h2>
          <p className="text-sm text-neutral-500">Catalogue #{artwork.catalogueNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          <Link
            href={`/sites/${siteId}/artworks`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Close
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-neutral-700">Images</h3>
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id} className="group relative">
                <img src={img.url} alt="" className="h-16 w-16 rounded object-cover" />
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

      <div className="mb-6 flex gap-2 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setTab("presentation")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "presentation"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Presentation
        </button>
        <button
          type="button"
          onClick={() => setTab("catalogue")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "catalogue"
              ? "border-b-2 border-neutral-900 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Catalogue
        </button>
      </div>

      <div>
        {tab === "presentation" ? (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                What customers see on the public site.
              </p>
              <form
                action={async (formData) => {
                  await updatePresentation(artwork.id, formData);
                  setSavedTab("presentation");
                  router.refresh();
                  setTimeout(() => setSavedTab(null), 2000);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">Title</label>
                  <input
                    type="text"
                    name="presentationTitle"
                    defaultValue={artwork.presentationTitle}
                    required
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Price (£)
                    </label>
                    <input
                      type="text"
                      name="presentationPrice"
                      defaultValue={artwork.presentationPrice || ""}
                      placeholder="e.g. 450.00"
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
                      placeholder="e.g. 100 x 100 cm"
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Medium
                    </label>
                    <input
                      type="text"
                      name="medium"
                      defaultValue={artwork.medium || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Group
                    </label>
                    <input
                      type="text"
                      name="presentationGroup"
                      defaultValue={artwork.presentationGroup || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Availability
                    </label>
                    <select
                      name="availability"
                      defaultValue={artwork.availability}
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
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                  >
                    Save
                  </button>
                  {savedTab === "presentation" && (
                    <span className="text-sm text-green-600">Saved</span>
                  )}
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-xs text-neutral-400">
                Your private working record — never shown on the public site.
              </p>
              <form
                action={async (formData) => {
                  await updateCatalogue(artwork.id, formData);
                  setSavedTab("catalogue");
                  router.refresh();
                  setTimeout(() => setSavedTab(null), 2000);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Name
                    </label>
                    <input
                      type="text"
                      name="catalogueName"
                      defaultValue={artwork.catalogueName}
                      required
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Year
                    </label>
                    <input
                      type="number"
                      name="year"
                      defaultValue={artwork.year ?? ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Type
                    </label>
                    <input
                      type="text"
                      name="type"
                      defaultValue={artwork.type || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Group
                    </label>
                    <input
                      type="text"
                      name="catalogueGroup"
                      defaultValue={artwork.catalogueGroup || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Size
                    </label>
                    <input
                      type="text"
                      name="size"
                      defaultValue={artwork.size || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Location
                    </label>
                    <input
                      type="text"
                      name="location"
                      defaultValue={artwork.location || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Edition
                    </label>
                    <input
                      type="text"
                      name="edition"
                      defaultValue={artwork.edition || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Available (qty)
                    </label>
                    <input
                      type="number"
                      name="availableQty"
                      defaultValue={artwork.availableQty ?? ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Price unframed (£)
                    </label>
                    <input
                      type="text"
                      name="priceUnframed"
                      defaultValue={artwork.priceUnframed || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Price framed (£)
                    </label>
                    <input
                      type="text"
                      name="priceFramed"
                      defaultValue={artwork.priceFramed || ""}
                      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Studio notes <span className="font-normal text-neutral-400">(private)</span>
                  </label>
                  <textarea
                    name="studioNotes"
                    defaultValue={artwork.studioNotes || ""}
                    rows={3}
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
                  {savedTab === "catalogue" && (
                    <span className="text-sm text-green-600">Saved</span>
                  )}
                </div>
              </form>
            </>
        )}
      </div>
    </div>
  );
}
