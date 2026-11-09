"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { pictureShapeRatio, type PageGridSpacing, type ViewerSettings } from "@/lib/pageStyleLayout";
import { SITE_PHONE_QUERY } from "@/lib/siteBreakpoint";
import { useSiteData } from "@/lib/siteData";
import { useSitePhone } from "@/lib/useSitePhone";
import FadeImage from "@/components/FadeImage";
import WorkPresentation, { usePresentation } from "@/components/WorkPresentation";

// A Portfolio viewer on a page (2026-11-02, the ISYT sites' portfolio
// pages — see ViewerSettings in lib/pageStyleLayout.ts): the works'
// thumbnails, a line, and the chosen work in the page's Presentation
// Template (WorkPresentation, drawn in the page) — the first work until
// another is chosen (2026-11-03, Craig's request, so there's no empty
// space). On a phone the curation's Description is above the thumbnails, which fill the width, and tapping one opens the
// work over them, full screen, with ✕ to go back (2026-11-03, Craig's
// request — as Exhibitions).

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
  const phone = useSitePhone();
  const [picked, setPicked] = useState<string | null>(null);
  // Beside the thumbnails, the first work until one is picked.
  const chosenId = picked ?? (phone ? null : (works[0]?.id ?? null));
  const [data, setData] = useState<CurationWorkPresentation | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [phoneOpen, setPhoneOpen] = useState(false);

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
    setPicked(id);
    if (window.matchMedia(SITE_PHONE_QUERY).matches) setPhoneOpen(true);
  };

  const shown = data && data.artworkId === chosenId ? data : null;
  const ratio = pictureShapeRatio(settings.shape);
  const work = shown && (
    <WorkPresentation
      key={shown.artworkId}
      data={shown}
      settings={presentation}
      viewIndex={viewIndex}
      onView={setViewIndex}
      site={siteData.forms}
      inline
    />
  );
  const descriptionText = description && (
    <p className="whitespace-pre-line break-words" style={descriptionStyle}>
      {description}
    </p>
  );

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

      {/* A phone: the Description above the thumbnails. */}
      {descriptionText && <div className="order-1 site:hidden">{descriptionText}</div>}

      {/* Kept in view on a desktop (`stickyDetail`), under a sticky Page
          heading (--sticky-top, set by the page), scrolling on its own if
          taller than the window — as Exhibitions. */}
      <div
        className={`hidden min-w-0 site:block ${
          settings.stickyDetail
            ? "site:sticky site:top-[calc(var(--sticky-top,0px)+16px)] site:max-h-[calc(100dvh-var(--sticky-top,0px)-32px)] site:self-start site:overflow-y-auto"
            : ""
        }`}
      >
        {work}
      </div>

      {phoneOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 overflow-y-auto site:hidden"
            style={{ background: presentation.colours.background }}
          >
            <div className="sticky top-0 z-10 flex justify-end p-2" style={{ color: presentation.colours.text }}>
              <button type="button" onClick={() => setPhoneOpen(false)} aria-label="Close" className="p-2 opacity-70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 pb-10">{work ?? <p className="py-16 text-center text-sm opacity-50">Loading…</p>}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
