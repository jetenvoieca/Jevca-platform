"use client";

import { useEffect, useState } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { useSiteData } from "@/lib/siteData";
import WorkPresentation, { usePresentation } from "@/components/WorkPresentation";

// One work's details, opened from a page (2026-10-05; drawn from the
// page's Presentation Template since 2026-10-19 — see WorkPresentation
// and lib/presentationTemplate.ts). Clicking one of its other pictures
// shows it instead; nothing is saved. Edited on the Curations page
// (CurationWorkPresentation). Content comes from the page's site data
// (lib/siteData.tsx) — live in the admin preview, the published snapshot
// on the site. The enquiry form sends only from the published site
// (siteData.signup, which also carries the robot check's key).

export default function CurationWorkView({
  curationId,
  artworkId,
  onClose,
}: {
  curationId: string;
  artworkId: string;
  onClose: () => void;
}) {
  const siteData = useSiteData();
  const settings = usePresentation();
  const [data, setData] = useState<CurationWorkPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewIndex, setViewIndex] = useState(0);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative mx-auto my-auto w-full ${settings.layout === "side" ? "max-w-6xl" : "max-w-xl"}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {loading || !data ? (
          <div className="rounded-lg bg-white px-6 py-16 text-center text-sm text-neutral-400">
            {loading ? "Loading…" : "This work is no longer in the curation."}
          </div>
        ) : (
          <WorkPresentation
            key={data.artworkId}
            data={data}
            settings={settings}
            viewIndex={viewIndex}
            onView={setViewIndex}
            onClose={onClose}
            site={siteData.signup}
          />
        )}
      </div>
    </div>
  );
}
