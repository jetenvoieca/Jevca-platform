export type HopperPreviewItem = {
  id: string;
  url: string;
  posterUrl: string | null;
  kind: string;
  createdAt: string;
};

// Shared image/video preview + "Received" timestamp — used identically
// by the full Hopper's SortingCard (HopperView.tsx) and the limited
// "set new Main image" modal opened from Delete & Replace
// (SetMainFromHopperModal.tsx). Pulled out into its own file (2026-09-13,
// direct request — "one set of code not different versions in different
// places") so the two can never visually drift apart into two separately
// -maintained copies of the same thing.
export default function HopperItemPreview({ item }: { item: HopperPreviewItem }) {
  return (
    <>
      <p className="mb-3 text-xs text-neutral-400">
        Received {new Date(item.createdAt).toLocaleString()}
      </p>
      {item.kind === "VIDEO" ? (
        <video
          src={item.url}
          poster={item.posterUrl || undefined}
          controls
          className="mb-4 max-h-[480px] w-full rounded-md bg-neutral-50 object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt=""
          className="mb-4 max-h-[480px] w-full rounded-md bg-neutral-50 object-contain"
        />
      )}
    </>
  );
}
