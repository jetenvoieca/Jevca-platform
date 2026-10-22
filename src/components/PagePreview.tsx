"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CurationDetail } from "@/lib/actions/curations";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import { sectionIsEmpty, type CurationSectionData } from "@/lib/curationSections";
import {
  arrangeItems,
  contentFits,
  contentKindOf,
  readHeroText,
  type ComponentContent,
} from "@/lib/pageComponents";
import type { SignupFormContent } from "@/lib/signupForms";
import type { SiteArtist } from "@/lib/siteArtist";
import {
  DEFAULT_GALLERY_PER_ROW,
  DEFAULT_LOGO_PHONE_WIDTH,
  type GalleryPerRow,
  type LayoutBlock,
  type PageTextStyle,
} from "@/lib/pageStyleLayout";
import {
  blockWidthOf,
  groupBlocksByRow,
  rowKey,
  rowSettingsOf,
  type GridSpacing,
  type HorizontalAlign,
  type PageMargins,
  type VerticalAlign,
} from "@/lib/rowLayout";
import { isTextComponent, mergeTextStyle } from "@/lib/textStyle";
import { useSiteData, type PageContent } from "@/lib/siteData";
import { PAGE_MARGIN_CLASS, pageMarginStyle } from "@/components/pageMargins";
import {
  phoneSizedClass,
  phoneSizedItemClass,
  phoneSizedStyle,
  perRowClass,
  perRowStyle,
  rowBlockClass,
  rowBlockStyle,
  rowClass,
} from "@/components/pageRows";
import CurationSectionView from "@/components/CurationSectionView";
import SiteFooter from "@/components/SiteFooter";
import { PAGE_DESKTOP_WIDTH } from "@/components/visualEditorParts";
import { bodyTextCss } from "@/components/textStyleCss";
import CurationWorkView from "@/components/CurationWorkView";
import { PresentationProvider } from "@/components/WorkPresentation";
import { DEFAULT_PRESENTATION } from "@/lib/presentationTemplate";
import SignupForm from "@/components/SignupForm";
import SlidingDoors from "@/components/SlidingDoors";
import HeroBlock from "@/components/HeroBlock";
import CanvasPlayer from "@/components/CanvasPlayer";
import FadeImage from "@/components/FadeImage";

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
//   lib/pageComponents.ts) — a Header or Byline typed on the page, the
//   Description in a Text or Text grid (this page's own copy if edited
//   here), both in the style's font, size, style and colour for that
//   component; the Video; Supporting Images (the first in a Single
//   Image, a grid in a Gallery); or the curation's works (a grid in a
//   Gallery, square panels in Sliding doors — see SlidingDoors). Works
//   and images removed on this page are left out, in the order chosen
//   here (2026-10-13). A Sign-up form (2026-10-10) shows once it's set
//   up in Arrange — see SignupForm. A Logo (2026-10-13) is the artist's
//   Logo from Settings, as wide as the component (its phone width on a
//   phone), never bigger than on the page as designed, linking to the
//   site's home page on the published site.
// - Canvas: the page's placed curations, played — see CanvasPlayer.
// Every page but a Canvas ends with the site's footer (2026-10-13) — see
// SiteFooter.
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
  const [loaded, setLoaded] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const blockBuild = style?.type === "BLOCK_BUILD";
  // On the published site everything is already here (2026-10-13), so
  // the page is drawn at once; the admin preview loads it.
  const now = useMemo(
    () => (curationId ? siteData.pageContentNow(pageId, curationId) : null),
    [siteData, pageId, curationId],
  );
  const content = now ?? loaded;

  useEffect(() => {
    setViewingId(null);
    if (!curationId || now) {
      setLoaded(null);
      return;
    }
    // Ignores a reply that arrives after a different page was selected.
    let current = true;
    setLoading(true);
    Promise.all([
      siteData.getCuration(curationId),
      blockBuild ? siteData.listSections(curationId) : Promise.resolve<CurationSectionData[]>([]),
      blockBuild ? siteData.getComponents(pageId) : Promise.resolve<ComponentContent[]>([]),
      blockBuild ? siteData.getSignupForms(pageId) : Promise.resolve<SignupFormContent[]>([]),
      siteData.getArtist(),
    ]).then(([curation, sections, components, signupForms, artist]) => {
      if (!current) return;
      setLoaded({ curation, sections, components, signupForms, artist });
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [siteData, curationId, pageId, blockBuild, now]);

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
        pageId={pageId}
        style={style}
        curation={curation}
        sections={content.sections}
        components={content.components}
        signupForms={content.signupForms}
        artist={content.artist}
        homeHref={siteData.homeHref}
        onOpen={setViewingId}
      />
    );
  } else {
    body = (
      <>
        <PlainPage curation={curation} onOpen={setViewingId} />
        {content.artist && <SiteFooter footer={content.artist.footer} />}
      </>
    );
  }

  const viewer = curation && viewingId && (
    <CurationWorkView curationId={curation.id} artworkId={viewingId} onClose={closeView} />
  );

  // Works open with the Page Style's Presentation Template (2026-10-19)
  // — also those opened from a Canvas's curations (CurationPanel).
  const presentation = style?.presentation ?? DEFAULT_PRESENTATION;

  if (fullScreen) {
    return (
      <PresentationProvider settings={presentation}>
        {body}
        {viewer}
      </PresentationProvider>
    );
  }

  return (
    <PresentationProvider settings={presentation}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        {viewer}
      </div>
    </PresentationProvider>
  );
}

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
  pageId,
  style,
  curation,
  sections,
  components,
  signupForms,
  artist,
  homeHref,
  onOpen,
}: {
  pageId: string;
  style: Extract<PageStyleSummary, { type: "BLOCK_BUILD" }>;
  curation: CurationDetail;
  sections: CurationSectionData[];
  components: ComponentContent[];
  signupForms: SignupFormContent[];
  artist: SiteArtist | null;
  homeHref: string | null;
  onOpen: (artworkId: string) => void;
}) {
  const { layout } = style;
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const sectionTypes = new Map(sections.map((s) => [s.id, s.type]));
  const contentByBlock = new Map(components.map((c) => [c.blockId, c]));
  const formByBlock = new Map(signupForms.map((f) => [f.blockId, f]));

  const textStyleOf = (block: LayoutBlock) =>
    isTextComponent(block.type) ? mergeTextStyle(layout.textStyles[block.type], block.textStyle) : undefined;

  const works = (block: LayoutBlock, content: ComponentContent): ReactNode => {
    const shown = arrangeItems(curation.works, (w) => w.artworkId, content);
    // A Single Image shows the first work as arranged on the page, and
    // opens it like a Gallery does (2026-10-16).
    const first = shown[0];
    const firstUrl = first ? (first.displayUrl ?? first.imageUrl) : null;
    if (block.type === "image" && first && firstUrl) {
      return (
        <button
          type="button"
          onClick={() => onOpen(first.artworkId)}
          title={first.catalogueName}
          className="block w-full overflow-hidden rounded hover:opacity-90"
        >
          <FadeImage src={firstUrl} alt={first.catalogueName} className="w-full" />
        </button>
      );
    }
    if (block.type === "gallery" && shown.length > 0) {
      return (
        <ImageGrid
          images={shown.map((w) => ({ id: w.artworkId, url: w.imageUrl, title: w.catalogueName }))}
          spacing={layout.gridSpacing}
          perRow={block.perRow ?? DEFAULT_GALLERY_PER_ROW}
          names={block.names ?? null}
          onOpen={onOpen}
        />
      );
    }
    if (block.type === "hero" && block.hero) {
      return <HeroBlock works={shown} text={readHeroText(content.text)} hero={block.hero} onOpen={onOpen} />;
    }
    if (block.type === "slidingdoors" && block.doors && shown.some((w) => w.displayUrl)) {
      return (
        <SlidingDoors
          works={shown}
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

  const fill = (block: LayoutBlock, horizontal: HorizontalAlign): ReactNode => {
    if (block.type === "logo") {
      if (!artist?.logoUrl) return null;
      const logo = <FadeImage src={artist.logoUrl} alt="" className="block w-full" />;
      return (
        <div className={phoneSizedClass(horizontal)}>
          <div
            className={phoneSizedItemClass()}
            style={phoneSizedStyle(block.phoneWidth ?? DEFAULT_LOGO_PHONE_WIDTH, designedWidth(block, layout.margins))}
          >
            {homeHref ? <a href={homeHref}>{logo}</a> : logo}
          </div>
        </div>
      );
    }
    if (block.type === "signup") {
      const form = formByBlock.get(block.id);
      if (!form || !block.signup) return null;
      return <SignupForm pageId={pageId} form={form} look={block.signup} textStyle={layout.textStyles.text} />;
    }
    const content = contentByBlock.get(block.id);
    if (!content) return null;
    const kind = contentKindOf(content, sectionTypes);
    if (!kind || !contentFits(block.type, kind)) return null;
    if (content.source === "WORKS") return works(block, content);
    if (content.source === "TYPED") {
      if (!content.text) return null;
      const style = textStyleOf(block);
      const css = style ? bodyTextCss(style) : undefined;
      return block.type === "byline" ? (
        <p className="whitespace-pre-line break-words text-base text-neutral-600" style={css}>
          {content.text}
        </p>
      ) : (
        <h2 className="whitespace-pre-line break-words text-2xl text-neutral-900" style={css}>
          {content.text}
        </h2>
      );
    }
    const curated = content.sectionId ? sectionById.get(content.sectionId) : undefined;
    if (!curated) return null;
    // This page's own Description, or its Supporting Images as arranged
    // here.
    const section: CurationSectionData =
      curated.type === "DESCRIPTION"
        ? { ...curated, text: content.text ?? curated.text }
        : curated.type === "IMAGES"
          ? { ...curated, media: arrangeItems(curated.media, (m) => m.imageId, content) }
          : curated;
    if (sectionIsEmpty(section)) return null;
    if (section.type === "IMAGES" && block.type === "image") {
      return <FadeImage src={section.media[0].url} alt="" className="w-full rounded" />;
    }
    if (section.type === "IMAGES" && block.type === "gallery") {
      return (
        <ImageGrid
          images={section.media.map((m) => ({ id: m.imageId, url: m.url }))}
          spacing={layout.gridSpacing}
          perRow={block.perRow ?? DEFAULT_GALLERY_PER_ROW}
        />
      );
    }
    return <CurationSectionView section={section} textStyle={textStyleOf(block)} />;
  };

  const rows: Row[] = groupBlocksByRow(layout.blocks).map((row) => {
    const key = rowKey(row);
    const settings = rowSettingsOf(layout, key);
    return {
      key,
      cells: row.map((b) => ({
        id: b.id,
        content: fill(b, settings.horizontal),
        width: blockWidthOf(b),
      })),
      ...settings,
    };
  });

  return (
    <StyledFrame
      margins={layout.margins}
      backgroundColor={layout.backgroundColor}
      rows={rows}
      empty="Nothing on this page yet — use Arrange to type its header and drag the curation's works and sections onto it."
      footer={
        artist && <SiteFooter footer={artist.footer} fontFamily={bodyTextCss(layout.textStyles.text).fontFamily} />
      }
    />
  );
}

// A component's width in pixels on the page as designed: its share of a
// desktop page (PAGE_DESKTOP_WIDTH) inside the desktop margins.
function designedWidth(block: LayoutBlock, margins: PageMargins): number {
  const inner = PAGE_DESKTOP_WIDTH - 2 * margins.desktop.horizontal;
  return Math.round((blockWidthOf(block) / 100) * inner);
}

// The page's background and margin around its rows, then the site's
// footer. Unfilled blocks are dropped, and so is any row left empty. It
// grows to fill the space it's in (the whole window on the published
// site), so the background reaches the bottom however short the page,
// as it does in the admin preview.
function StyledFrame({
  margins,
  backgroundColor,
  rows: allRows,
  empty,
  footer,
}: {
  margins: PageMargins;
  backgroundColor: string | null;
  rows: Row[];
  empty: string;
  footer: ReactNode;
}) {
  const rows = allRows
    .map((r) => ({ ...r, cells: r.cells.filter((c) => c.content) }))
    .filter((r) => r.cells.length > 0);

  return (
    <div
      className={`flex min-h-full grow flex-col ${PAGE_MARGIN_CLASS}`}
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
      {footer && <div className="mt-auto">{footer}</div>}
    </div>
  );
}

// No Display Style: the works with the Description boxed beside them.
function PlainPage({ curation, onOpen }: { curation: CurationDetail; onOpen: (artworkId: string) => void }) {
  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        {curation.works.length === 0 ? (
          <Message text={`"${curation.name}" has no works yet.`} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] items-start gap-4">
            {curation.works.map((w) => (
              <button key={w.artworkId} type="button" onClick={() => onOpen(w.artworkId)} className="text-left">
                <div className="aspect-square overflow-hidden rounded-md bg-neutral-100 hover:opacity-90">
                  {w.imageUrl ? (
                    <FadeImage src={w.imageUrl} alt={w.catalogueName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                      No image
                    </div>
                  )}
                </div>
                <span className="mt-1.5 block truncate text-sm text-neutral-800">{w.catalogueName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[27%] min-w-[14rem] shrink-0 rounded-xl border border-neutral-300 p-4">
        <h4 className="mb-2 text-center text-lg text-neutral-900">Description</h4>
        {curation.description ? (
          <p className="whitespace-pre-line break-words text-sm text-neutral-800">{curation.description}</p>
        ) : (
          <p className="text-center text-sm text-neutral-400">No description yet.</p>
        )}
      </div>
    </div>
  );
}

// One image in a grid: a work (clickable, opens its presentation) or an
// Supporting Image (image only).
type GridImage = { id: string; url: string | null; title?: string };

// Images in order, the Gallery's number across on a desktop and on a
// phone, spaced as the style's grid spacing. With `onOpen`, clicking one
// opens it. With `names` (2026-10-22), each work's name under it in that
// look.
function ImageGrid({
  images,
  spacing,
  perRow,
  names = null,
  onOpen,
}: {
  images: GridImage[];
  spacing: GridSpacing;
  perRow: GalleryPerRow;
  names?: PageTextStyle | null;
  onOpen?: (id: string) => void;
}) {
  return (
    <div className={perRowClass()} style={perRowStyle(perRow, spacing)}>
      {images.map((img) => {
        const picture = img.url ? (
          <FadeImage src={img.url} alt={img.title ?? ""} className="aspect-square w-full object-cover" />
        ) : (
          <div className="aspect-square w-full bg-neutral-100" />
        );
        const inside = (
          <>
            <div className="overflow-hidden rounded">{picture}</div>
            {names && img.title && (
              <p className="mt-3 px-1 text-left" style={bodyTextCss(names)}>
                {img.title}
              </p>
            )}
          </>
        );
        return onOpen ? (
          <button
            key={img.id}
            type="button"
            onClick={() => onOpen(img.id)}
            title={img.title}
            className="block text-left hover:opacity-90"
          >
            {inside}
          </button>
        ) : (
          <div key={img.id}>{inside}</div>
        );
      })}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{text}</p>;
}
