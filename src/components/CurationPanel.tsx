"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CurationDetail } from "@/lib/actions/curations";
import type { CurationSectionData } from "@/lib/curationSections";
import { useSiteData } from "@/lib/siteData";
import CurationWorkView from "@/components/CurationWorkView";

// How the grid's images fly in (2026-10-06): from this far below,
// slightly smaller, over this long, each one in a row a little after the
// one before.
const FLY_DISTANCE = 48;
const FLY_SCALE = 0.92;
const FLY_DURATION = 0.6;
const FLY_STAGGER_MS = 90;
const GRID_COLUMNS = 4;

// The curation panel (2026-10-06, from Craig's mockups) — opened by
// clicking an artwork on a Canvas page. Scrolls as one: the artwork
// clicked, large, with its name; then the curation's presentation
// sections in order (Tag line, Description, Free text, Video, Images —
// see CurationSection); then a grid of the curation's other works,
// which fly in as they're scrolled into view (see FlyIn). Clicking a
// work in the grid puts it at the top and scrolls back up. Clicking the
// large image or its name opens that work's details (CurationWorkView)
// on top; closing that comes back here. Content comes from the page's
// site data (lib/siteData.tsx).
export default function CurationPanel({
  curationId,
  artworkId,
  onClose,
}: {
  curationId: string;
  artworkId: string;
  onClose: () => void;
}) {
  const siteData = useSiteData();
  const [curation, setCuration] = useState<CurationDetail | null>(null);
  const [sections, setSections] = useState<CurationSectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState(artworkId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    Promise.all([siteData.getCuration(curationId), siteData.listSections(curationId)]).then(
      ([detail, rows]) => {
        if (!current) return;
        setCuration(detail);
        setSections(rows);
        setLoading(false);
      }
    );
    return () => {
      current = false;
    };
  }, [siteData, curationId]);

  // Escape closes the panel — unless the details are open on top, which
  // close themselves first.
  useEffect(() => {
    if (detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen, onClose]);

  const showWork = (id: string) => {
    setCurrentId(id);
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const work = curation?.works.find((w) => w.artworkId === currentId) ?? null;
  const others = curation?.works.filter((w) => w.artworkId !== currentId) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 justify-end border-b border-neutral-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>
          ) : !curation || !work ? (
            <p className="py-10 text-center text-sm text-neutral-400">
              This work is no longer in the curation.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                title="See this work's details"
                className="block"
              >
                {work.displayUrl ? (
                  <img
                    src={work.displayUrl}
                    alt={work.catalogueName}
                    className="max-h-[65vh] w-full rounded-md object-contain"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-md bg-neutral-100" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="text-center text-xl text-neutral-900 hover:underline"
              >
                {work.catalogueName}
              </button>

              {sections.map((s) => (
                <Section key={s.id} section={s} />
              ))}

              {others.length > 0 && (
                <div
                  className="grid gap-2 pt-2"
                  style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}
                >
                  {others.map((w, i) => (
                    <FlyIn
                      key={w.artworkId}
                      root={bodyRef}
                      delayMs={(i % GRID_COLUMNS) * FLY_STAGGER_MS}
                    >
                      <button
                        type="button"
                        onClick={() => showWork(w.artworkId)}
                        title={w.catalogueName}
                        className="block w-full overflow-hidden rounded hover:opacity-90"
                      >
                        {w.imageUrl ? (
                          <img
                            src={w.imageUrl}
                            alt={w.catalogueName}
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="aspect-square w-full bg-neutral-100" />
                        )}
                      </button>
                    </FlyIn>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {detailsOpen && work && (
        <CurationWorkView
          curationId={curationId}
          artworkId={work.artworkId}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </div>
  );
}

// Shows its content by flying it in — rising up and fading in, after
// `delayMs` — the first time it scrolls into view within `root`. Moved
// with transform and opacity only, so the graphics processor animates
// it. Shown straight away, with no movement, when the device asks for
// reduced motion.
function FlyIn({
  root,
  delayMs,
  children,
}: {
  root: RefObject<HTMLDivElement | null>;
  delayMs: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { root: root.current, threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown
          ? "none"
          : `translate3d(0, ${FLY_DISTANCE}px, 0) scale(${FLY_SCALE})`,
        transition: `opacity ${FLY_DURATION}s ease-out ${delayMs}ms, transform ${FLY_DURATION}s ease-out ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}

// One presentation section, as visitors see it. Text sections are plain
// text (2026-10-07). Empty sections are left out.
function Section({ section }: { section: CurationSectionData }) {
  switch (section.type) {
    case "TAGLINE":
      return section.text ? (
        <p className="text-center text-base italic text-neutral-700">{section.text}</p>
      ) : null;

    case "DESCRIPTION":
      return section.text ? (
        <p className="whitespace-pre-line break-words text-sm text-neutral-800">{section.text}</p>
      ) : null;

    case "TEXT":
      return section.heading || section.text ? (
        <div>
          {section.heading && (
            <h3 className="mb-1 text-base font-medium text-neutral-900">{section.heading}</h3>
          )}
          {section.text && (
            <p className="whitespace-pre-line break-words text-sm text-neutral-800">
              {section.text}
            </p>
          )}
        </div>
      ) : null;

    case "VIDEO": {
      const video = section.media[0];
      return video ? (
        <video
          src={video.url}
          poster={video.posterUrl ?? undefined}
          controls
          className="w-full rounded-md bg-black"
        />
      ) : null;
    }

    case "IMAGES":
      return section.media.length > 0 ? (
        <div className="flex flex-col gap-2">
          {section.media.map((m) => (
            <img key={m.imageId} src={m.url} alt="" className="w-full rounded-md" />
          ))}
        </div>
      ) : null;
  }
}
