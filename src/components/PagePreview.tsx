"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { CurationDetail } from "@/lib/actions/curations";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import { sectionIsEmpty, type CurationSectionData } from "@/lib/curationSections";
import type { ComponentContent } from "@/lib/pageComponents";
import {
  blockWidthOf,
  groupBlocksByRow,
  isTextComponent,
  rowKey,
  rowSettingsOf,
  type GridSpacing,
  type HorizontalAlign,
  type LayoutBlock,
  type PageMargins,
  type VerticalAlign,
} from "@/lib/pageStyleLayout";
import { useSiteData } from "@/lib/siteData";
import { PAGE_MARGIN_CLASS, pageMarginStyle } from "@/components/pageMargins";
import { rowBlockClass, rowBlockStyle, rowClass } from "@/components/pageRows";
import CurationSectionView from "@/components/CurationSectionView";
import CurationWorkView from "@/components/CurationWorkView";
import SlidingDoors from "@/components/SlidingDoors";
import CanvasPlayer from "@/components/CanvasPlayer";

// A page, drawn in its Display Style (2026-10-04) — the Pages page's
// Preview panel, and (2026-10-06) the site's own pages, full screen.
// Content comes from the page's site data (lib/siteData.tsx): live in
// the admin preview, the published snapshot on the site.
//
// With a Display Style (2026-10-05): the page drawn in that style, with
// the style's background colour and page margin (2026-10-06, desktop
// and phone — see components/pageMargins.ts).
// - Block Build (2026-10-07, was Private / Custom): each component
//   shows what was put in it in the page's Arrange (see
//   lib/pageComponents.ts) — a text section (in a Header, Text or Text
//   grid, in the style's font, size, style and colour for that
//   component type), a video, an Images section (one image in a Single
//   Image, a grid in a Gallery), or the curation's works (a grid in a
//   Gallery, square panels in Sliding doors — see SlidingDoors).
// - Canvas: the page's placed curations, played — see CanvasPlayer.
// Grids of images use the style's grid spacing, the gaps between blocks
// its block spacing, and each block its width (% of the page) and its
// row's alignment (2026-10-07). On a phone a row's blocks stack, full
// width — see components/pageRows.ts.
// Anything with nothing to fill it (an empty component, an empty
// section, no Description…) is left out — the space above the next
// shown block is the space below the last one shown — and no outlines
// or labels are shown. Images are image only.
//
// Without one: a simple grid of the curation's works with its
// Description in a box beside them, as on the Curations page.
//
// Clicking a work (2026-10-05) opens its presentation in this curation,
// read-only — see CurationWorkView.
//
// No title is drawn above the page (2026-10-07), so the admin preview
// starts where the published page does.
//
// `fullScreen` (the site's own pages): a Canvas fills the browser window.
export default function PagePreview({
  pageId,
  curationId,
  style,
  fullScreen = false,
}: {
  pageId: string;
  curationId: string | null;
  style: PageStyleSummary | null;
  fullScreen?: boolean;
}) {
  const siteData = useSiteData();
  const [content, setContent] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const blockBuild = style?.type === "BLOCK_BUILD";

  useEffect(() => {
    setViewingId(null);
    if (!curationId) {
      setContent(null);
      return;
    }
    // Ignores a reply that arrives after a different page was selected.
    let current = true;
    setLoading(true);
    Promise.all([
      siteData.getCuration(curationId),
      blockBuild
        ? siteData.listSections(curationId)
        : Promise.resolve<CurationSectionData[]>([]),
      blockBuild ? siteData.getComponents(pageId) : Promise.resolve<ComponentContent[]>([]),
    ]).then(([curation, sections, components]) => {
      if (!current) return;
      setContent({ curation, sections, components });
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [siteData, curationId, pageId, blockBuild]);

  const closeView = useCallback(() => setViewingId(null), []);
  const curation = content?.curation ?? null;

  let body: ReactNode;
  if (style?.type === "CANVAS") {
    body = <CanvasPlayer key={pageId} pageId={pageId} layout={style.layout} fullScreen={fullScreen} />;
  } else if (!curationId) {
    body = <Message text="This page has no curation. Choose one with Edit." />;
  } else if (loading || !content) {
    body = <Message text="Loading…" />;
  } else if (!curation) {
    body = <Message text="This page's curation could not be found." />;
  } else if (style?.type === "BLOCK_BUILD") {
    body = (
      <BlockBuildPage
        style={style}
        curation={curation}
        sections={content.sections}
        components={content.components}
        onOpen={setViewingId}
      />
    );
  } else {
    body = <PlainPage curation={curation} onOpen={setViewingId} />;
  }

  const viewer = curation && viewingId && (
    <CurationWorkView curationId={curation.id} artworkId={viewingId} onClose={closeView} />
  );

  if (fullScreen) {
    return (
      <>
        {body}
        {viewer}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {viewer}
    </div>
  );
}

// What a page shows, loaded together. Sections and components are only
// loaded for a Block Build page.
type PageContent = {
  curation: CurationDetail | null;
  sections: CurationSectionData[];
  components: ComponentContent[];
};

// One row of the page as shown: its blocks' contents and widths, the
// space below it, the space between its blocks and its alignment.
type Row = {
  key: string;
  cells: { id: string; content: ReactNode; width: number }[];
  below: number;
  between: number;
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
};

// A Block Build page — see the note at the top.
function BlockBuildPage({
  style,
  curation,
  sections,
  components,
  onOpen,
}: {
  style: Extract<PageStyleSummary, { type: "BLOCK_BUILD" }>;
  curation: CurationDetail;
  sections: CurationSectionData[];
  components: ComponentContent[];
  onOpen: (artworkId: string) => void;
}) {
  const { layout } = style;
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const contentByBlock = new Map(components.map((c) => [c.blockId, c.sectionId]));

  const works = (block: LayoutBlock): ReactNode => {
    if (block.type === "gallery" && curation.works.length > 0) {
      return (
        <ImageGrid images={worksImages(curation)} spacing={layout.gridSpacing} onOpen={onOpen} />
      );
    }
    if (block.type === "slidingdoors" && block.doors && curation.works.some((w) => w.displayUrl)) {
      return (
        <SlidingDoors
          works={curation.works}
          duration={block.doors.duration}
          speed={block.doors.speed}
          gap={block.doors.gap}
          perSlide={block.doors.perSlide}
          height={block.doors.height}
          margins={layout.margins}
          onOpen={onOpen}
        />
      );
    }
    return null;
  };

  const fill = (block: LayoutBlock): ReactNode => {
    if (!contentByBlock.has(block.id)) return null;
    const sectionId = contentByBlock.get(block.id) ?? null;
    if (sectionId === null) return works(block);
    const section = sectionById.get(sectionId);
    if (!section || sectionIsEmpty(section)) return null;
    if (section.type === "IMAGES" && block.type === "image") {
      return <img src={section.media[0].url} alt="" className="w-full rounded" />;
    }
    if (section.type === "IMAGES" && block.type === "gallery") {
      return (
        <ImageGrid
          images={section.media.map((m) => ({ id: m.imageId, url: m.url }))}
          spacing={layout.gridSpacing}
        />
      );
    }
    return (
      <CurationSectionView
        section={section}
        textStyle={isTextComponent(block.type) ? layout.textStyles[block.type] : undefined}
      />
    );
  };

  const rows: Row[] = groupBlocksByRow(layout.blocks).map((row) => {
    const key = rowKey(row);
    return {
      key,
      cells: row.map((b) => ({ id: b.id, content: fill(b), width: blockWidthOf(b) })),
      ...rowSettingsOf(layout, key),
    };
  });

  return (
    <StyledFrame
      margins={layout.margins}
      backgroundColor={layout.backgroundColor}
      rows={rows}
      empty="Nothing on this page yet — use Arrange to drag the curation's sections onto it."
    />
  );
}

// The page's background and margin around its rows. Unfilled blocks
// are dropped, and so is any row left empty.
function StyledFrame({
  margins,
  backgroundColor,
  rows: allRows,
  empty,
}: {
  margins: PageMargins;
  backgroundColor: string | null;
  rows: Row[];
  empty: string;
}) {
  const rows = allRows
    .map((r) => ({ ...r, cells: r.cells.filter((c) => c.content) }))
    .filter((r) => r.cells.length > 0);

  return (
    <div
      className={`flex min-h-full flex-col rounded-md ${PAGE_MARGIN_CLASS}`}
      style={{ ...pageMarginStyle(margins), backgroundColor: backgroundColor ?? undefined }}
    >
      {rows.length === 0 ? (
        <Message text={empty} />
      ) : (
        rows.map((row, i) => (
          <div
            key={row.key}
            className={rowClass(row.horizontal, row.vertical)}
            style={{ marginTop: i > 0 ? rows[i - 1].below : 0, gap: row.between }}
          >
            {row.cells.map((c) => (
              <div key={c.id} className={rowBlockClass()} style={rowBlockStyle(c.width)}>
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

// One image in a grid: a work (clickable, opens its presentation) or an
// image from an Images section (image only).
type GridImage = { id: string; url: string | null; title?: string };

function worksImages(curation: CurationDetail): GridImage[] {
  return curation.works.map((w) => ({ id: w.artworkId, url: w.imageUrl, title: w.catalogueName }));
}

// Images four across, in order, spaced as the style's grid spacing.
// With `onOpen`, clicking one opens it.
function ImageGrid({
  images,
  spacing,
  onOpen,
}: {
  images: GridImage[];
  spacing: GridSpacing;
  onOpen?: (id: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-4"
      style={{ rowGap: spacing.vertical, columnGap: spacing.horizontal }}
    >
      {images.map((img) => {
        const picture = img.url ? (
          <img src={img.url} alt={img.title ?? ""} className="aspect-square w-full object-cover" />
        ) : (
          <div className="aspect-square w-full bg-neutral-100" />
        );
        return onOpen ? (
          <button
            key={img.id}
            type="button"
            onClick={() => onOpen(img.id)}
            title={img.title}
            className="overflow-hidden rounded hover:opacity-90"
          >
            {picture}
          </button>
        ) : (
          <div key={img.id} className="overflow-hidden rounded">
            {picture}
          </div>
        );
      })}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{text}</p>;
}
