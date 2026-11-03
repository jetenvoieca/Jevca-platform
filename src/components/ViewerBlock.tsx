"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { pictureShapeRatio, type PageGridSpacing, type ViewerSettings } from "@/lib/pageStyleLayout";
import { SITE_PHONE_QUERY } from "@/lib/siteBreakpoint";
import { useSiteData } from "@/lib/siteData";
import FadeImage from "@/components/FadeImage";
import WorkPresentation, { usePresentation } from "@/components/WorkPresentation";

// A Portfolio viewer on a page (2026-11-02, the ISYT sites' portfolio
// pages — see ViewerSettings in lib/pageStyleLayout.ts): the works'
// thumbnails, a line, and the chosen work in the page's Presentation
// Template (WorkPresentation, drawn in the page). Before one is chosen,
// the curation's Description shows there. On a phone the thumbnails fill
// the width with the chosen work above them, scrolled to when chosen.

// No SOLD flag on the thumbnails (2026-11-03, Craig's request): the
// chosen work's details say Sold.
export type ViewerWork = { id: string; url: string | null; title: string };

export default function ViewerBlock({
  curationId,
  works,
  settings,
  spacing,
  description,
  descriptionStyle,
}: {
  curationId: string;
  works: ViewerWork[];
  settings: ViewerSettings;
  spacing: PageGridSpacing;
  description: string | null;
  descriptionStyle?: CSSProperties;
}) {
  const siteData = useSiteData();
  const presentation = usePresentation();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [data, setData] = useState<CurationWorkPresentation | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const workRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chosenId) return;
    let current = true;
    siteData.getPresentation(curationId, chosenId).then((result) => {
      if (!current) return;
      setData(result);
      setViewIndex(0);
    });
    return () => {
      current = false;
    };
  }, [siteData, curationId, chosenId]);

  const choose = (id: string) => {
    setChosenId(id);
    if (window.matchMedia(SITE_PHONE_QUERY).matches) {
      workRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const shown = data && data.artworkId === chosenId ? data : null;
  const ratio = pictureShapeRatio(settings.shape);

  return (
    <div
      className="flex flex-col gap-6 site:grid site:items-stretch site:gap-y-0 site:[column-gap:var(--viewer-gap)] site:[grid-template-columns:var(--viewer-columns)]"
      style={
        {
          "--viewer-gap": `${settings.gap}px`,
          "--viewer-columns": `${settings.thumbShare}% auto minmax(0, 1fr)`,
        } as CSSProperties
      }
    >
      <div
        className="order-2 grid content-start gap-y-[var(--grid-vp)] [grid-template-columns:repeat(var(--across-phone),minmax(0,1fr))] site:order-none site:gap-y-[var(--grid-v)] site:[grid-template-columns:repeat(var(--across),minmax(0,1fr))]"
        style={
          {
            "--across": settings.perRow,
            "--across-phone": settings.phonePerRow,
            "--grid-v": `${spacing.vertical}px`,
            "--grid-vp": `${spacing.phoneVertical}px`,
            columnGap: spacing.horizontal,
          } as CSSProperties
        }
      >
        {works.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => choose(w.id)}
            title={w.title}
            aria-pressed={w.id === chosenId}
            className="relative block overflow-hidden hover:opacity-90"
            style={{ aspectRatio: ratio }}
          >
            {w.url ? (
              <FadeImage src={w.url} alt={w.title} className="h-full w-full object-cover" />
            ) : (
              <span className="block h-full w-full bg-neutral-100" />
            )}
          </button>
        ))}
      </div>

      <div
        aria-hidden
        className="hidden site:block"
        style={settings.line ? { borderLeft: `${settings.line.thickness}px solid ${settings.line.colour}` } : undefined}
      />

      <div ref={workRef} className="order-1 min-w-0 scroll-mt-4 site:order-none">
        {shown ? (
          <WorkPresentation
            key={shown.artworkId}
            data={shown}
            settings={presentation}
            viewIndex={viewIndex}
            onView={setViewIndex}
            site={siteData.forms}
            inline
          />
        ) : (
          !chosenId &&
          description && (
            <p className="whitespace-pre-line break-words" style={descriptionStyle}>
              {description}
            </p>
          )
        )}
      </div>
    </div>
  );
}
