"use client";

import { useState } from "react";

// Full display shape for one artwork tile — deliberately carries the
// same read-only detail fields (description/medium/size/edition/viewing
// location) whether it's rendered from live editor state or from the
// standalone /preview route, so there's exactly one render path for
// "what a Portfolio artwork looks like" (see the resize-system incident
// note in the handover doc — one path per concern, not two that can
// drift apart).
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

// Renders a Portfolio page: a row of category pills, that category's
// thumbnail grid, and — once a thumbnail is clicked — a read-only detail
// view below it. Self-contained (its own group/selection state) so the
// exact same component works both inside the editor's live preview
// column and on the standalone /preview route, with no callback props
// needed from either caller.
export default function PortfolioGrid({
  title,
  groups,
}: {
  title: string;
  groups: PortfolioGridGroup[];
}) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id ?? null);
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null;
  const selectedArtwork =
    activeGroup?.artworks.find((a) => a.id === selectedArtworkId) ?? null;

  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold text-neutral-900">{title}</h1>

      {groups.length === 0 ? (
        <p className="text-sm text-neutral-400">No categories added yet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setActiveGroupId(g.id);
                  setSelectedArtworkId(null);
                }}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  activeGroup?.id === g.id
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {activeGroup && activeGroup.artworks.length === 0 ? (
            <p className="text-sm text-neutral-400">No artworks in this category yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {activeGroup?.artworks.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedArtworkId(a.id)}
                  className={`rounded-md border-2 p-1 text-left ${
                    selectedArtworkId === a.id ? "border-neutral-900" : "border-transparent"
                  }`}
                >
                  {a.imageUrl ? (
                    <img
                      src={a.imageUrl}
                      alt=""
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                      No image
                    </div>
                  )}
                  <p className="mt-1 truncate text-xs font-medium text-neutral-900">
                    {a.presentationTitle}
                  </p>
                </button>
              ))}
            </div>
          )}

          {selectedArtwork && (
            <div className="mt-6 border-t border-neutral-200 pt-4">
              {selectedArtwork.imageUrl && (
                <img
                  src={selectedArtwork.imageUrl}
                  alt=""
                  className="mb-3 max-h-80 w-full rounded-md bg-neutral-50 object-contain"
                />
              )}
              <h2 className="text-lg font-semibold text-neutral-900">
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
          )}
        </>
      )}
    </div>
  );
}
