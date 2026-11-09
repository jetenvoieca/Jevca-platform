import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import BaseStar from "@/components/BaseStar";
import { PlayMark } from "@/components/SectionMediaView";

// The Artist App's shared pieces (Craig's mockups): the large white panel
// with its heading box(es), the narrower panel beside it, and a work's
// tile.

// With `heading`, opens with that heading (and `aside` beside it, e.g. a
// button); otherwise the screen places its own PanelHeadings.
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
    <section className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-8 py-8 lg:overflow-y-auto">
      {heading !== undefined && <PanelHeading aside={aside}>{heading}</PanelHeading>}
      {children}
    </section>
  );
}

export function PanelHeading({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-8 flex items-stretch justify-center gap-3">
      <h2 className="w-fit min-w-72 border border-neutral-200 px-6 py-1.5 text-center text-2xl text-neutral-800">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function SidePanel({ children }: { children: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-3 lg:w-[340px] lg:overflow-y-auto">
      {children}
    </section>
  );
}

export function WorkGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-7 md:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

export type TileWork = {
  catalogueName: string;
  catalogueNumber: string;
  isBase: boolean;
  imageUrl: string | null;
};

// A work: square picture, its name (cut short) and ★ #number. Takes a
// ref and any attributes, so a screen can make it draggable.
export const WorkTile = forwardRef<HTMLDivElement, { work: TileWork } & HTMLAttributes<HTMLDivElement>>(
  function WorkTile({ work, className = "", ...rest }, ref) {
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
        <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-neutral-800">{work.catalogueName}</span>
          <span className="shrink-0 text-neutral-400">
            <BaseStar isBase={work.isBase} />#{work.catalogueNumber}
          </span>
        </div>
      </div>
    );
  },
);

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
