"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getCuration, type CurationDetail, type CurationWork } from "@/lib/actions/curations";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import type { LayoutBlock } from "@/lib/pageStyleLayout";
import { groupBlocksByRow } from "@/lib/blocks";

// The Pages page's Preview panel (2026-10-04): the selected page's
// curation.
//
// With a Display Style (2026-10-05, first experiment): the page drawn in
// that style, filled from the curation — Gallery blocks show the works'
// images (image only), Text blocks show the curation's Description. Any
// block with nothing to fill it (Header, Video, an empty Gallery, Text
// with no Description…) is left out, and no outlines or labels are shown.
// A Section style is its artwork grid. The style's background colour is
// applied.
//
// Without one: a simple grid of the works with the curation's
// Description in a box beside them, as on the Curations page.
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

  useEffect(() => {
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

  let body: ReactNode;
  if (!curationId) {
    body = <Message text="This page has no curation. Choose one with Edit." />;
  } else if (loading) {
    body = <Message text="Loading…" />;
  } else if (!curation) {
    body = <Message text="This page's curation could not be found." />;
  } else if (style) {
    body = <StyledPage style={style} curation={curation} />;
  } else {
    body = <PlainPage curation={curation} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{title}</h3>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}

// The page in its Display Style — see the note at the top.
function StyledPage({
  style,
  curation,
}: {
  style: PageStyleSummary;
  curation: CurationDetail;
}) {
  if (style.type === "SECTION") {
    return curation.works.length > 0 ? (
      <ImageGrid works={curation.works} />
    ) : (
      <Message text={`"${curation.name}" has no works yet.`} />
    );
  }

  const fill = (block: LayoutBlock): ReactNode => {
    if (block.type === "gallery" && curation.works.length > 0) {
      return <ImageGrid works={curation.works} />;
    }
    if (block.type === "text" && curation.description) {
      return (
        <p className="whitespace-pre-line break-words text-sm text-neutral-800">
          {curation.description}
        </p>
      );
    }
    return null;
  };

  // Unfilled blocks are dropped, and so is any row left empty.
  const rows = groupBlocksByRow(style.layout.blocks)
    .map((row) =>
      row.flatMap((b) => {
        const content = fill(b);
        return content ? [{ id: b.id, content }] : [];
      })
    )
    .filter((row) => row.length > 0);

  return (
    <div
      className="flex min-h-full flex-col gap-4 rounded-md p-4"
      style={{ backgroundColor: style.layout.backgroundColor ?? undefined }}
    >
      {rows.length === 0 ? (
        <Message text="Nothing in this style can be filled from the page's curation yet." />
      ) : (
        rows.map((row) => (
          <div key={row[0].id} className="flex gap-4">
            {row.map((b) => (
              <div key={b.id} className="min-w-0 flex-1">
                {b.content}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// No Display Style: the works with the Description boxed beside them.
function PlainPage({ curation }: { curation: CurationDetail }) {
  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        {curation.works.length === 0 ? (
          <Message text={`"${curation.name}" has no works yet.`} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] items-start gap-4">
            {curation.works.map((w) => (
              <figure key={w.artworkId}>
                <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
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
                <figcaption className="mt-1.5 truncate text-sm text-neutral-800">
                  {w.catalogueName}
                </figcaption>
              </figure>
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

// The works' images only, in the curation's order.
function ImageGrid({ works }: { works: CurationWork[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {works.map((w) =>
        w.imageUrl ? (
          <img
            key={w.artworkId}
            src={w.imageUrl}
            alt={w.catalogueName}
            className="aspect-square w-full rounded object-cover"
          />
        ) : (
          <div key={w.artworkId} className="aspect-square w-full rounded bg-neutral-100" />
        )
      )}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{text}</p>;
}
