import type { ReactNode } from "react";
import {
  pictureShapeRatio,
  type GalleryPerRow,
  type HeroSettings,
  type LayoutBlockType,
  type PictureWordsSettings,
  type SignupLook,
  type SlidingDoorsSettings,
  type StoriesSettings,
} from "@/lib/pageStyleLayout";
import type { MailBlockType } from "@/lib/mailTemplateLayout";
import type { GridSpacing } from "@/lib/rowLayout";
import { perRowClass, perRowStyle, type PreviewDevice } from "@/components/pageRows";

// A rough outline of each component (2026-10-04; moved here from
// PageStylePreview 2026-10-08 so Mail Templates share it), so a layout
// reads at a glance without content — used by the Page Styles and Mail
// Templates previews, the visual editor (VisualLayoutEditor) and the
// Pages page's Arrange (PageSectionsArranger), so a component looks the
// same in all of them. A Page Style's Gallery shows its own number
// across — for `device` if given, otherwise as the screen's width
// decides; a mail gallery is four across.
export function BlockShape({
  type,
  spacing,
  doors,
  signup,
  perRow,
  names = false,
  hero,
  pictureWords,
  stories,
  device,
}: {
  type: LayoutBlockType | MailBlockType;
  spacing: GridSpacing & { phoneVertical?: number };
  doors?: SlidingDoorsSettings;
  signup?: SignupLook;
  perRow?: GalleryPerRow;
  // A Gallery showing its works' names; a Hero's settings.
  names?: boolean;
  hero?: HeroSettings;
  pictureWords?: PictureWordsSettings;
  stories?: StoriesSettings;
  device?: PreviewDevice;
}) {
  switch (type) {
    case "hero": {
      // Drawn for a desktop unless `device` is a phone.
      const phone = device === "phone";
      const share = hero?.pictureShare ?? 50;
      return (
        <div
          className={phone ? "flex flex-col" : "grid items-center"}
          style={{
            gap: phone ? (hero?.gap.phone ?? 32) : (hero?.gap.desktop ?? 64),
            gridTemplateColumns: phone ? undefined : `${100 - share}fr ${share}fr`,
          }}
        >
          <div className="flex flex-col gap-3">
            <Bar className="h-2.5 w-2/3" />
            <Bar className="h-8 w-4/5" />
            <Bar className="h-8 w-3/5 bg-rose-100" />
            <Bar className="h-2.5 w-1/2" />
          </div>
          <div
            className={`w-full rounded bg-neutral-200 ${phone && (hero?.pictureFirstOnPhone ?? true) ? "order-first" : ""}`}
            style={{
              aspectRatio: pictureShapeRatio(hero ? (phone ? hero.shape.phone : hero.shape.desktop) : "square"),
            }}
          />
        </div>
      );
    }
    case "picturewords": {
      const left = (pictureWords?.side ?? "left") === "left";
      const share = pictureWords?.pictureShare ?? 50;
      const box = (
        <div
          className="w-full rounded bg-neutral-200"
          style={{ aspectRatio: pictureShapeRatio(pictureWords?.shape.desktop ?? "portrait") }}
        />
      );
      const words = (
        <div className="flex flex-col gap-3">
          <Bar className="h-7 w-3/4" />
          <Bar className="h-7 w-1/2 bg-rose-100" />
          <Bar className="mt-3 h-2.5 w-full" />
          <Bar className="h-2.5 w-11/12" />
          <Bar className="h-2.5 w-4/5" />
        </div>
      );
      return (
        <div
          className="grid items-start gap-6"
          style={{ gridTemplateColumns: left ? `${share}fr ${100 - share}fr` : `${100 - share}fr ${share}fr` }}
        >
          {left ? box : words}
          {left ? words : box}
        </div>
      );
    }
    case "stories": {
      // Two stories, the second with its picture swapped to the other side.
      const share = stories?.pictureShare ?? 50;
      const ratio = pictureShapeRatio(stories?.shape.desktop ?? "landscape");
      return (
        <div className="flex flex-col gap-6">
          {[0, 1].map((i) => {
            const left = ((stories?.side ?? "left") === "left") === (i === 0);
            const box = <div className="w-full rounded bg-neutral-200" style={{ aspectRatio: ratio }} />;
            const words = (
              <div className="flex flex-col gap-3 self-center">
                <Bar className="h-5 w-2/3" />
                <Bar className="mt-2 h-2.5 w-full" />
                <Bar className="h-2.5 w-11/12" />
                <Bar className="h-2.5 w-4/5" />
              </div>
            );
            return (
              <div
                key={i}
                className="grid gap-6"
                style={{ gridTemplateColumns: left ? `${share}fr ${100 - share}fr` : `${100 - share}fr ${share}fr` }}
              >
                {left ? box : words}
                {left ? words : box}
              </div>
            );
          })}
        </div>
      );
    }
    case "entries":
      return (
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className={`flex flex-col gap-2 ${i === 0 ? "border-b border-neutral-200 pb-4" : ""}`}>
              <Bar className="h-2 w-16" />
              <Bar className="h-4 w-1/2" />
              <div className="mt-1 flex items-start gap-4">
                <div className="h-20 w-20 shrink-0 rounded bg-neutral-200" />
                <div className="flex flex-1 flex-col gap-2">
                  <Bar className="h-2.5 w-full" />
                  <Bar className="h-2.5 w-4/5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    case "pageheading":
      return (
        <div className="flex flex-col gap-2 border-b border-neutral-300 pb-3">
          <Bar className="h-5 w-1/3" />
          <Bar className="h-7 w-1/2 bg-neutral-100" />
        </div>
      );
    case "header":
      return <Bar className="h-7 w-2/3" />;
    case "line":
      return <div className="border-t border-neutral-300" />;
    case "byline":
      return <Bar className="h-3.5 w-1/3" />;
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
      return <PlaceholderGrid perRow={perRow ?? MAIL_PER_ROW} spacing={spacing} device={device} names={names} />;
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
        <div className="flex h-40 items-center justify-center rounded bg-neutral-200 text-2xl text-neutral-400">▶</div>
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
      return <div className="flex h-16 items-center text-2xl italic text-neutral-300">Signature</div>;
  }
}

// Grey squares, four across, spaced as the layout's grid spacing.
const MAIL_PER_ROW: GalleryPerRow = { desktop: 4, phone: 4, smallest: 60 };

// Two rows of squares.
function PlaceholderGrid({
  perRow,
  spacing,
  device,
  names,
}: {
  perRow: GalleryPerRow;
  spacing: GridSpacing & { phoneVertical?: number };
  device?: PreviewDevice;
  names: boolean;
}) {
  return (
    <div className={perRowClass(device)} style={perRowStyle(perRow, spacing)}>
      {Array.from({ length: perRow.desktop * 2 }, (_, i) => (
        <div key={i}>
          <div className="aspect-square rounded bg-neutral-200" />
          {names && <Bar className="mt-2 h-2 w-1/2" />}
        </div>
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
  return <div className={`rounded ${className.includes("bg-") ? "" : "bg-neutral-200"} ${className}`} />;
}
