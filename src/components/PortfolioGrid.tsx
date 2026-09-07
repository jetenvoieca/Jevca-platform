"use client";

import { useState } from "react";

// Full display shape for one artwork tile — carries the same read-only
// detail fields (description/medium/size/edition/viewing location)
// whether it's rendered from live editor state or the standalone
// /preview route, so there's exactly one render path for what a
// Portfolio artwork looks like.
export type PortfolioGridArtwork = {
  id: string;
  presentationTitle: string;
  imageUrl: string | null;
  presentationPrice: string | null;
  description: string | null;
  presentationMedium: string | null;
  viewingLocation: string | null;
  size: string | null;
  edition: string | null;
};

export type PortfolioGridGroup = {
  id: string;
  name: string;
  artworks: PortfolioGridArtwork[];
};

// The site's own pages, one per nav entry (2026-09-07) — fixed-format
// templates like this one build their nav straight from whichever real
// pages exist on the site (matching jillysuttonsculpture.com: each of
// "portfolio", "showcase", "profile", etc. is literally a distinct
// page), not from the general Menu Builder — Menu Builder is for
// freeform templates, which don't have a fixed page structure to draw
// on. Just labels for now — not linked anywhere yet since there's no
// real public-facing site renderer (see the note in the handover doc).
export type PortfolioSitePage = { id: string; title: string };

// Matches the isendyouthis.com reference sites (e.g.
// jillysuttonsculpture.com): a category switcher, a compact thumbnail
// grid, and the selected artwork's image/details shown alongside it in
// the same view — not hidden behind a click-through. Self-contained (its
// own group/selection state) so the exact same component works both
// inside the editor's live preview column and on the standalone
// /preview route.
export default function PortfolioGrid({
  artistName,
  title,
  groups,
  sitePages,
}: {
  artistName?: string;
  title: string;
  groups: PortfolioGridGroup[];
  // Optional — the editor's own live preview column doesn't show this
  // (nothing's been through Publish, and the editor is about this one
  // page, not the whole site) — only passed from the standalone
  // /preview route.
  sitePages?: PortfolioSitePage[] | null;
}) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id ?? null);
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null;
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(
    activeGroup?.artworks[0]?.id ?? null
  );

  const selectedArtwork =
    activeGroup?.artworks.find((a) => a.id === selectedArtworkId) ?? null;

  const selectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    const g = groups.find((x) => x.id === groupId);
    setSelectedArtworkId(g?.artworks[0]?.id ?? null);
  };

  return (
    <div className="flex gap-10">
      <div className="min-w-0 flex-1">
        {artistName && (
          <p className="font-serif text-lg font-bold text-neutral-800">{artistName}</p>
        )}
        <h1 className="mb-4 font-serif text-2xl text-neutral-400">
          {title}
          {activeGroup ? `: ${activeGroup.name}` : ""}
        </h1>

        {groups.length === 0 ? (
          <p className="text-sm text-neutral-400">No categories added yet.</p>
        ) : (
          <>
            {/* Only shown once there's actually something to switch
                between — a single category has nothing to pick from,
                so the underlined button just duplicated the heading
                above (issue 2, 2026-09-07). */}
            {groups.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 border-b border-neutral-200 pb-3 text-sm">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGroup(g.id)}
                    className={
                      activeGroup?.id === g.id
                        ? "font-semibold text-neutral-900 underline"
                        : "text-neutral-500 hover:text-neutral-800"
                    }
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            {activeGroup && activeGroup.artworks.length === 0 ? (
              <p className="text-sm text-neutral-400">No artworks in this category yet.</p>
            ) : (
              <div className="flex flex-col gap-6 sm:flex-row">
                {/* Thumbnail grid — a fixed, modest width (matches the
                    mockup's smaller left-hand box), not stretched to
                    fill whatever space is available. Each tile is a
                    fixed-height square wrapper around the image, rather
                    than an `aspect-square` on the <img> itself — Safari
                    can size an aspect-ratio'd <img> inconsistently
                    before/if it fails to load, which showed up as an
                    empty tall box (bug fixed 2026-09-07). */}
                <div className="grid w-full shrink-0 grid-cols-3 gap-2 sm:w-[260px]">
                  {activeGroup?.artworks.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedArtworkId(a.id)}
                      className={`aspect-square overflow-hidden rounded-md border-2 ${
                        selectedArtworkId === a.id ? "border-neutral-900" : "border-transparent"
                      }`}
                    >
                      {a.imageUrl ? (
                        <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                          No image
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Details — always visible alongside the grid, not
                    revealed only after a click. */}
                <div className="min-w-0 flex-1">
                  {selectedArtwork ? (
                    <div>
                      {selectedArtwork.imageUrl && (
                        <img
                          src={selectedArtwork.imageUrl}
                          alt=""
                          className="mb-3 max-h-96 w-full rounded-md bg-neutral-50 object-contain"
                        />
                      )}
                      <h2 className="font-serif text-lg font-semibold text-neutral-900">
                        {selectedArtwork.presentationTitle}
                      </h2>
                      {selectedArtwork.description && (
                        <p className="mt-2 whitespace-pre-line text-sm text-neutral-600">
                          {selectedArtwork.description}
                        </p>
                      )}
                      <div className="mt-3 space-y-0.5 text-xs text-neutral-500">
                        {selectedArtwork.presentationMedium && <p>{selectedArtwork.presentationMedium}</p>}
                        {selectedArtwork.size && <p>{selectedArtwork.size}</p>}
                        {selectedArtwork.edition && <p>Edition of {selectedArtwork.edition}</p>}
                        {selectedArtwork.viewingLocation && (
                          <p>Can be seen at {selectedArtwork.viewingLocation}</p>
                        )}
                      </div>
                      {selectedArtwork.presentationPrice && (
                        <p className="mt-2 text-sm font-medium text-neutral-900">
                          £{selectedArtwork.presentationPrice}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-400">Select an artwork to see its details.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* The site's own pages, one per nav entry (2026-09-07) — matches
          jillysuttonsculpture.com's own right-hand nav, built from real
          pages rather than the general Menu Builder (see the note on
          the sitePages prop — fixed-format templates don't use Menu
          Builder). */}
      {sitePages && sitePages.length > 0 && (
        <div className="hidden w-40 shrink-0 border-l border-neutral-200 pl-6 font-serif text-sm sm:block">
          {sitePages.map((p) => (
            <p key={p.id} className="mb-2 font-semibold text-neutral-900">
              {p.title}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
