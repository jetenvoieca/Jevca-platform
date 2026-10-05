"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getCuration, type CurationDetail, type CurationWork } from "@/lib/actions/curations";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import {
  rowKey,
  rowSpacingOf,
  type GridSpacing,
  type LayoutBlock,
} from "@/lib/pageStyleLayout";
import { groupBlocksByRow } from "@/lib/blocks";
import CurationWorkView from "@/components/CurationWorkView";
import SlidingDoors from "@/components/SlidingDoors";

// The Pages page's Preview panel (2026-10-04): the selected page's
// curation.
//
// With a Display Style (2026-10-05): the page drawn in that style,
// filled from the curation, with the style's background colour.
// - Section: the works' images, then the curation's Description.
// - Private / Custom: Gallery blocks show the works' images, Text blocks
//   the curation's Description, Sliding doors the works' main images in
//   pairs or one at a time (see SlidingDoors).
// Grids of images use the style's grid spacing, and the gaps between
// blocks its block spacing. Anything with nothing to fill it yet
// (Byline, Header, Video, an empty Gallery, no Description…) is left
// out — the space above the next shown block is the space below the
// last one shown — and no outlines or labels are shown. Images are image
// only.
//
// Without one: a simple grid of the works with the curation's
// Description in a box beside them, as on the Curations page.
//
// Clicking a work (2026-10-05) opens its presentation in this curation,
// read-only — see CurationWorkView.
export default function PagePreview({
  artistId,
  title,
  curationId,
  style,
}: {
  artistId: string;
  title: string;
  curationId: string | null;
  style: PageStyleSummary | null;
}) {
  const [curation, setCuration] = useState<CurationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    setViewingId(null);
    if (!curationId) {
      setCuration(null);
      return;
    }
    // Ignores a reply that arrives after a different page was selected.
    let current = true;
    setLoading(true);
    getCuration(curationId, artistId).then((detail) => {
      if (!current) return;
      setCuration(detail);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [curationId, artistId]);

  const closeView = useCallback(() => setViewingId(null), []);

  let body: ReactNode;
  if (!curationId) {
    body = <Message text="This page has no curation. Choose one with Edit." />;
  } else if (loading) {
    body = <Message text="Loading…" />;
  } else if (!curation) {
    body = <Message text="This page's curation could not be found." />;
  } else if (style) {
    body = <StyledPage style={style} curation={curation} onOpen={setViewingId} />;
  } else {
    body = <PlainPage curation={curation} onOpen={setViewingId} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{title}</h3>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {curation && viewingId && (
        <CurationWorkView
          curationId={curation.id}
          artworkId={viewingId}
          artistId={artistId}
          onClose={closeView}
        />
      )}
    </div>
  );
}

// One row of the page as shown: its blocks' contents, the space below
// it and the space between its blocks.
type Row = { key: string; cells: { id: string; content: ReactNode }[]; below: number; between: number };

// The page in its Display Style — see the note at the top.
function StyledPage({
  style,
  curation,
  onOpen,
}: {
  style: PageStyleSummary;
  curation: CurationDetail;
  onOpen: (artworkId: string) => void;
}) {
  const hasWorks = curation.works.length > 0;
  const grid = hasWorks ? (
    <ImageGrid works={curation.works} spacing={style.layout.gridSpacing} onOpen={onOpen} />
  ) : null;
  const description = curation.description ? (
    <p className="whitespace-pre-line break-words text-sm text-neutral-800">
      {curation.description}
    </p>
  ) : null;

  const fill = (block: LayoutBlock): ReactNode => {
    if (block.type === "gallery") return grid;
    if (block.type === "text") return description;
    if (block.type === "slidingdoors" && block.doors && curation.works.some((w) => w.displayUrl)) {
      return (
        <SlidingDoors
          works={curation.works}
          duration={block.doors.duration}
          speed={block.doors.speed}
          gap={block.doors.gap}
          perSlide={block.doors.perSlide}
          onOpen={onOpen}
        />
      );
    }
    return null;
  };

  const allRows: Row[] =
    style.type === "SECTION"
      ? [
          {
            key: "grid",
            cells: [{ id: "grid", content: grid }],
            below: style.layout.spacing.belowGrid,
            between: 0,
          },
          {
            key: "description",
            cells: [{ id: "description", content: description }],
            below: style.layout.spacing.belowDescription,
            between: 0,
          },
        ]
      : groupBlocksByRow(style.layout.blocks).map((row) => {
          const key = rowKey(row);
          return {
            key,
            cells: row.map((b) => ({ id: b.id, content: fill(b) })),
            ...rowSpacingOf(style.layout, key),
          };
        });

  // Unfilled blocks are dropped, and so is any row left empty.
  const rows = allRows
    .map((r) => ({ ...r, cells: r.cells.filter((c) => c.content) }))
    .filter((r) => r.cells.length > 0);

  return (
    <div
      className="flex min-h-full flex-col rounded-md p-4"
      style={{ backgroundColor: style.layout.backgroundColor ?? undefined }}
    >
      {rows.length === 0 ? (
        <Message text="Nothing in this style can be filled from the page's curation yet." />
      ) : (
        rows.map((row, i) => (
          <div
            key={row.key}
            className="flex"
            style={{ marginTop: i > 0 ? rows[i - 1].below : 0, gap: row.between }}
          >
            {row.cells.map((c) => (
              <div key={c.id} className="min-w-0 flex-1">
                {c.content}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// No Display Style: the works with the Description boxed beside them.
function PlainPage({
  curation,
  onOpen,
}: {
  curation: CurationDetail;
  onOpen: (artworkId: string) => void;
}) {
  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        {curation.works.length === 0 ? (
          <Message text={`"${curation.name}" has no works yet.`} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] items-start gap-4">
            {curation.works.map((w) => (
              <button
                key={w.artworkId}
                type="button"
                onClick={() => onOpen(w.artworkId)}
                className="text-left"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-neutral-100 hover:opacity-90">
                  {w.imageUrl ? (
                    <img
                      src={w.imageUrl}
                      alt={w.catalogueName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                      No image
                    </div>
                  )}
                </div>
                <span className="mt-1.5 block truncate text-sm text-neutral-800">
                  {w.catalogueName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[27%] min-w-[14rem] shrink-0 rounded-xl border border-neutral-300 p-4">
        <h4 className="mb-2 text-center text-lg text-neutral-900">Description</h4>
        {curation.description ? (
          <p className="whitespace-pre-line break-words text-sm text-neutral-800">
            {curation.description}
          </p>
        ) : (
          <p className="text-center text-sm text-neutral-400">No description yet.</p>
        )}
      </div>
    </div>
  );
}

// The works' images only, in the curation's order, spaced as the
// style's grid spacing. Clicking one opens its presentation.
function ImageGrid({
  works,
  spacing,
  onOpen,
}: {
  works: CurationWork[];
  spacing: GridSpacing;
  onOpen: (artworkId: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-4"
      style={{ rowGap: spacing.vertical, columnGap: spacing.horizontal }}
    >
      {works.map((w) => (
        <button
          key={w.artworkId}
          type="button"
          onClick={() => onOpen(w.artworkId)}
          title={w.catalogueName}
          className="overflow-hidden rounded hover:opacity-90"
        >
          {w.imageUrl ? (
            <img
              src={w.imageUrl}
              alt={w.catalogueName}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="aspect-square w-full bg-neutral-100" />
          )}
        </button>
      ))}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{text}</p>;
}
