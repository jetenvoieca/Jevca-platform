"use client";

import { useEffect, useState } from "react";
import {
  getCurationWorkPresentation,
  type CurationWorkPresentation,
} from "@/lib/actions/curations";
import { isValidInstalmentCount, splitIntoInstalments } from "@/lib/saleMath";

// One work's presentation within a curation, read-only (2026-10-05, from
// Craig's mockup) — opened by clicking a work in the Pages preview. Shows
// just the contents, no field labels: the image being viewed, the
// work's images beneath it (clicking one shows it above — it only
// changes what's viewed here, nothing is saved), its name and this
// curation's description, and its price with what it comes to in
// instalments. Edited on the Curations page (CurationWorkPresentation).

function formatMoney(n: number, currency: string): string {
  const digits = Number.isInteger(n) ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(digits)}`;
  }
}

export default function CurationWorkView({
  curationId,
  artworkId,
  artistId,
  onClose,
}: {
  curationId: string;
  artworkId: string;
  artistId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CurationWorkPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewIndex, setViewIndex] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setViewIndex(0);
    getCurationWorkPresentation(curationId, artistId, artworkId).then((result) => {
      if (!current) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [curationId, artistId, artworkId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body;
  if (loading) {
    body = <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>;
  } else if (!data) {
    body = (
      <p className="py-10 text-center text-sm text-neutral-400">
        This work is no longer in the curation.
      </p>
    );
  } else {
    const viewed = data.images[viewIndex] ?? data.images[0] ?? null;
    const description = data.description ?? data.defaultDescription ?? "";
    const price = data.offeredPrice != null ? Number(data.offeredPrice) : null;
    const count = data.defaultInstalmentCount;
    const perInstalment =
      price != null && price > 0 && isValidInstalmentCount(count)
        ? splitIntoInstalments(price, count)[0]
        : null;

    body = (
      <div className="flex flex-col gap-4">
        {viewed &&
          (viewed.kind === "VIDEO" ? (
            <video
              key={viewed.id}
              src={viewed.displayUrl}
              poster={viewed.posterUrl ?? undefined}
              controls
              className="max-h-[60vh] w-full rounded-md bg-black object-contain"
            />
          ) : (
            <img
              src={viewed.displayUrl}
              alt={data.catalogueName}
              className="max-h-[60vh] w-full rounded-md object-contain"
            />
          ))}

        {data.images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {data.images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setViewIndex(i)}
                className={`overflow-hidden rounded-md border-2 ${
                  i === viewIndex ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                }`}
              >
                <img
                  src={img.kind === "VIDEO" ? (img.posterUrl ?? img.url) : img.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-neutral-300 p-4">
          <p className="mb-3 text-center text-xl text-neutral-900">{data.catalogueName}</p>
          {description && (
            <p className="whitespace-pre-line break-words text-sm text-neutral-800">
              {description}
            </p>
          )}
        </div>

        {price != null && (
          <div className="rounded-xl border border-neutral-300 p-4 text-center text-sm text-neutral-800">
            {formatMoney(price, data.priceCurrency)}
            {perInstalment != null && (
              <span className="text-neutral-500">
                {" "}
                or {count} instalments of {formatMoney(perInstalment, data.priceCurrency)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 justify-end border-b border-neutral-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
      </div>
    </div>
  );
}
