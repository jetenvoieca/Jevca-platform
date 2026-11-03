"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { useSiteData } from "@/lib/siteData";
import WorkPresentation, { usePresentation } from "@/components/WorkPresentation";

// A work's details sliding in from the left (2026-11-03, Craig's request —
// as the product panel on his British High Street site): the page's
// Presentation Template (WorkPresentation, drawn in the panel — a "picture
// on the left" template shows the picture on top here, as the panel is
// narrow), with its enquiry and payment forms, in a white panel the
// height of the window, 440px wide (the full width on a phone), over
// whatever opened it — used by a Dynamic presentation. ✕, Escape or a
// click beside it slides it away. Content comes from the page's site data.

const SLIDE_SECONDS = 0.45;

export default function WorkSidePanel({
  curationId,
  artworkId,
  onClose,
}: {
  curationId: string;
  artworkId: string;
  onClose: () => void;
}) {
  const siteData = useSiteData();
  const template = usePresentation();
  const settings = template.layout === "side" ? { ...template, layout: "stacked" as const } : template;
  const [data, setData] = useState<CurationWorkPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewIndex, setViewIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setViewIndex(0);
    siteData.getPresentation(curationId, artworkId).then((result) => {
      if (!current) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [siteData, curationId, artworkId]);

  // Slides in once drawn; slides out, then closes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const close = () => {
    setOpen(false);
    setTimeout(onClose, SLIDE_SECONDS * 1000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] transition-colors"
      style={{ background: open ? "rgba(0,0,0,0.25)" : "transparent", transitionDuration: `${SLIDE_SECONDS}s` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <aside
        className="absolute inset-y-0 left-0 w-full overflow-y-auto shadow-[8px_0_30px_rgba(0,0,0,0.18)] sm:w-[440px]"
        style={{
          background: settings.colours.background,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: `transform ${SLIDE_SECONDS}s cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 p-1 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: settings.colours.text }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="px-6 pb-8 pt-12">
          {loading || !data ? (
            <p className="py-16 text-center text-sm opacity-50">{loading ? "Loading…" : "This work is no longer in the curation."}</p>
          ) : (
            <WorkPresentation
              key={data.artworkId}
              data={data}
              settings={settings}
              viewIndex={viewIndex}
              onView={setViewIndex}
              site={siteData.forms}
              inline
            />
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
