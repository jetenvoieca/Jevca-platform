"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import BaseStar from "@/components/BaseStar";
import { PlayMark } from "@/components/SectionMediaView";

// The Artist App's shared pieces (Craig's mockups): the large white panel
// with its heading box(es), the narrower panel beside it, and a work's
// tile.

// With `heading`, opens with that heading (and `aside` beside it, e.g. a
// button).
export function MainPanel({
  heading,
  aside,
  children,
}: {
  heading?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-5 py-6 sm:overflow-y-auto lg:px-8 lg:py-8">
      {heading !== undefined && <PanelHeading aside={aside}>{heading}</PanelHeading>}
      {children}
    </section>
  );
}

export function PanelHeading({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-8 flex items-stretch justify-center gap-3">
      <h2 className="w-fit min-w-0 border border-neutral-200 px-6 py-1.5 text-center text-2xl text-neutral-800 lg:min-w-72">
        {children}
      </h2>
      {aside}
    </div>
  );
}

// The frame's right-hand panel (2026-11-11, Craig's screenshots) holds
// the top band of icons, then a screen's side contents, then the app's
// buttons. A screen puts contents in the panel with <SidePanel> — while
// none does, the frame shows the site's pages (see ArtistAppFrame) — and
// its own tools in the band, before publish, with <BandTools>.
type Slot = { node: HTMLElement | null; claim: () => () => void };
type Slots = { side: Slot; band: Slot };
const SlotsContext = createContext<Slots | null>(null);

function useSlot() {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const slot = useMemo<Slot>(
    () => ({
      node,
      claim: () => {
        setClaims((c) => c + 1);
        return () => setClaims((c) => c - 1);
      },
    }),
    [node],
  );
  return { slot, setNode, claimed: claims > 0 };
}

// For the frame: where each goes (`setNode`), and whether a screen has
// put side contents in the panel.
export function useFrameSlots() {
  const side = useSlot();
  const band = useSlot();
  const value = useMemo<Slots>(() => ({ side: side.slot, band: band.slot }), [side.slot, band.slot]);
  return { value, Provider: SlotsContext.Provider, side, band };
}

function InSlot({ which, children }: { which: keyof Slots; children: ReactNode }) {
  const slot = useContext(SlotsContext)?.[which];
  const claim = slot?.claim;
  useEffect(() => claim?.(), [claim]);
  if (!slot?.node) return null;
  return createPortal(children, slot.node);
}

export function SidePanel({ children }: { children: ReactNode }) {
  return (
    <InSlot which="side">
      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
    </InSlot>
  );
}

export function BandTools({ children }: { children: ReactNode }) {
  return <InSlot which="band">{children}</InSlot>;
}

export function WorkGrid({ children }: { children: ReactNode }) {
  // As many columns as the panel's width allows.
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-6 gap-y-7">{children}</div>;
}

export type TileWork = {
  catalogueName: string;
  catalogueNumber: string;
  isBase: boolean;
  imageUrl: string | null;
};

// A work: square picture, its name (cut short) and ★ #number. Takes a
// ref and any attributes, so a screen can make it draggable.
// `aside` (2026-11-09, Arrange Pages) takes the place of the ★ #number
// (e.g. "Remove work"); `hideNumber` leaves the number out.
export const WorkTile = forwardRef<
  HTMLDivElement,
  { work: TileWork; aside?: ReactNode; hideNumber?: boolean } & HTMLAttributes<HTMLDivElement>
>(function WorkTile({ work, aside, hideNumber = false, className = "", ...rest }, ref) {
  return (
    <div ref={ref} className={`min-w-0 ${className}`} {...rest}>
      {work.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={work.imageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="aspect-square w-full rounded-sm object-cover"
        />
      ) : (
        <div className="aspect-square w-full rounded-sm bg-neutral-100" />
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-neutral-800">{work.catalogueName}</span>
        {aside ??
          (!hideNumber && (
            <span className="shrink-0 text-neutral-400">
              <BaseStar isBase={work.isBase} />#{work.catalogueNumber}
            </span>
          ))}
      </div>
    </div>
  );
});

// A square picture (a video's still, with a play mark) or an empty square,
// with a line or two under it — a Profile entry or an exhibition on a
// page (2026-11-09). Tappable when given `onClick`.
export function PictureTile({
  url,
  video = false,
  label,
  detail,
  onClick,
}: {
  url: string | null;
  video?: boolean;
  label: string;
  detail?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="relative">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" draggable={false} className="aspect-square w-full rounded-sm object-cover" />
        ) : (
          <div className="aspect-square w-full rounded-sm border border-neutral-300" />
        )}
        {video && <PlayMark />}
      </div>
      <p className="mt-2 truncate text-sm text-neutral-800">{label}</p>
      {detail && <p className="truncate text-sm text-neutral-400">{detail}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="block min-w-0 text-left">
      {body}
    </button>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}
