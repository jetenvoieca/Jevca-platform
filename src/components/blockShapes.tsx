import type { ReactNode } from "react";
import type { LayoutBlockType, SignupLook, SlidingDoorsSettings } from "@/lib/pageStyleLayout";
import type { MailBlockType } from "@/lib/mailTemplateLayout";
import type { GridSpacing } from "@/lib/rowLayout";

// A rough outline of each component (2026-10-04; moved here from
// PageStylePreview 2026-10-08 so Mail Templates share it), so a layout
// reads at a glance without content — used by the Page Styles and Mail
// Templates previews, the visual editor (VisualLayoutEditor) and the
// Pages page's Arrange (PageSectionsArranger), so a component looks the
// same in all of them.
export function BlockShape({
  type,
  spacing,
  doors,
  signup,
}: {
  type: LayoutBlockType | MailBlockType;
  spacing: GridSpacing;
  doors?: SlidingDoorsSettings;
  signup?: SignupLook;
}) {
  switch (type) {
    case "header":
      return <Bar className="h-7 w-2/3" />;
    case "text":
      return (
        <div className="flex flex-col gap-2">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-11/12" />
          <Bar className="h-2.5 w-4/5" />
        </div>
      );
    case "image":
      return <div className="h-40 rounded bg-neutral-200" />;
    case "gallery":
      return <PlaceholderGrid count={8} spacing={spacing} />;
    case "artwork":
      return (
        <div className="flex gap-3">
          <div className="aspect-square w-1/3 rounded bg-neutral-200" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-2.5 w-1/2" />
          </div>
        </div>
      );
    case "video":
      return (
        <div className="flex h-40 items-center justify-center rounded bg-neutral-200 text-2xl text-neutral-400">
          ▶
        </div>
      );
    case "textgrid":
      return (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Bar key={i} className="h-2.5 w-full" />
          ))}
        </div>
      );
    case "slidingdoors": {
      // Square panels, as on the page.
      const single = doors?.perSlide === 1;
      return (
        <div className="relative flex h-48 justify-center" style={{ gap: single ? 0 : (doors?.gap ?? 0) }}>
          <div className="aspect-square h-full rounded bg-neutral-200" />
          {!single && <div className="aspect-square h-full rounded bg-neutral-200" />}
          <span className="absolute inset-0 flex items-center justify-center gap-10 text-2xl text-neutral-400">
            <span>◀</span>
            {!single && <span>▶</span>}
          </span>
        </div>
      );
    }
    case "signup":
      // An email box and its button, in the style's button colours.
      return (
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-md border border-neutral-300 bg-white" />
          <div
            className="flex h-10 w-32 items-center justify-center rounded-md text-xs"
            style={{ backgroundColor: signup?.buttonColour, color: signup?.buttonTextColour }}
          >
            Subscribe
          </div>
        </div>
      );
    case "logo":
      return (
        <div className="flex justify-center">
          <div className="flex h-14 w-40 items-center justify-center rounded bg-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400">
            Logo
          </div>
        </div>
      );
    case "button":
      return (
        <div className="flex justify-center">
          <div className="h-10 w-40 rounded-md bg-neutral-300" />
        </div>
      );
    case "signature":
      return (
        <div className="flex h-16 items-center text-2xl italic text-neutral-300">Signature</div>
      );
  }
}

// Grey squares, four across, spaced as the layout's grid spacing.
function PlaceholderGrid({ count, spacing }: { count: number; spacing: GridSpacing }) {
  return (
    <div
      className="grid grid-cols-4"
      style={{ rowGap: spacing.vertical, columnGap: spacing.horizontal }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-square rounded bg-neutral-200" />
      ))}
    </div>
  );
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-white/70 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
      {children}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-neutral-200 ${className}`} />;
}
