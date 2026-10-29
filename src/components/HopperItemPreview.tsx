import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/formatDate";

export type HopperPreviewItem = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: string;
  createdAt: string;
};

// The Hopper's image/video preview + "Received" timestamp, for its
// SortingCard (HopperView.tsx).
//
// `corner` (2026-10-17, the Hopper's Crop): a control on the picture's
// bottom-right corner.
export default function HopperItemPreview({ item, corner }: { item: HopperPreviewItem; corner?: ReactNode }) {
  return (
    <>
      <p className="mb-3 text-xs text-neutral-400">Received {formatDateTime(item.createdAt)}</p>
      <div className="relative mb-4">
        {item.kind === "VIDEO" ? (
          <video
            src={item.url}
            poster={item.posterUrl || undefined}
            controls
            className="max-h-[480px] w-full rounded-md bg-neutral-50 object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="max-h-[480px] w-full rounded-md bg-neutral-50 object-contain" />
        )}
        {corner && <div className="absolute bottom-2 right-2">{corner}</div>}
      </div>
    </>
  );
}
