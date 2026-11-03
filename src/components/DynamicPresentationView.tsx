"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import type { CurationDetail } from "@/lib/actions/curations";
import type { DynamicPresentationData } from "@/lib/actions/dynamicPresentations";
import { useSiteData } from "@/lib/siteData";
import CurationWorkView from "@/components/CurationWorkView";
import { DynamicSectionBox, DynamicWorksContext, type DynamicWork } from "@/components/DynamicSection";

// A curation's Dynamic presentation on the site (2026-11-03, phase one —
// see lib/dynamicPresentation.ts): opened from a Canvas page in place of
// the curation panel, over the page, its sections one under another (up
// to 1200px wide, centred), scrolling. Clicking a work opens its
// Presentation window on top; ✕ or Escape closes.

const MAX_WIDTH = 1200;

export default function DynamicPresentationView({
  curationId,
  data,
  onClose,
}: {
  curationId: string;
  data: DynamicPresentationData;
  onClose: () => void;
}) {
  const siteData = useSiteData();
  const [curation, setCuration] = useState<CurationDetail | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    siteData.getCuration(curationId).then((c) => {
      if (current) setCuration(c);
    });
    return () => {
      current = false;
    };
  }, [siteData, curationId]);

  useEffect(() => {
    if (workId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workId, onClose]);

  const works = useMemo(
    () =>
      new Map<string, DynamicWork>(
        (curation?.works ?? []).map((w) => [w.artworkId, { url: w.displayUrl ?? w.imageUrl, name: w.catalogueName }]),
      ),
    [curation],
  );

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white transition-opacity hover:opacity-80"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <DynamicWorksContext.Provider value={works}>
        <div className="mx-auto flex w-full flex-col" style={{ maxWidth: MAX_WIDTH }}>
          {data.presentation.sections.map((s) => (
            <DynamicSectionBox
              key={s.id}
              section={s}
              media={data.media}
              renderItem={(item, content, style) =>
                item.kind === "work" && item.artworkId && works.has(item.artworkId) ? (
                  <button
                    key={item.id}
                    type="button"
                    style={style}
                    onClick={() => setWorkId(item.artworkId)}
                    title={works.get(item.artworkId)?.name}
                    className="block transition-opacity hover:opacity-90"
                  >
                    {content}
                  </button>
                ) : (
                  <div key={item.id} style={style}>
                    {content}
                  </div>
                )
              }
            />
          ))}
        </div>
      </DynamicWorksContext.Provider>
      {workId && <CurationWorkView curationId={curationId} artworkId={workId} onClose={() => setWorkId(null)} />}
    </div>,
    document.body,
  );
}
