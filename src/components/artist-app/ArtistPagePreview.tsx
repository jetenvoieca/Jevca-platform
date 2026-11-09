"use client";

import Link from "next/link";
import type { PageStyleSummary } from "@/lib/actions/pageStyles";
import { ARTIST_APP_FONT, artistAppPageHref } from "@/lib/artistApp";
import type { ContactPanelSettings } from "@/lib/contactPanel";
import { LiveSiteData } from "@/lib/siteData";
import { publishedHomePath } from "@/lib/siteSnapshot";
import { ContactPanelProvider } from "@/components/ContactPanel";
import PagePreview from "@/components/PagePreview";
import PublishButton from "@/components/PublishButton";
import PublishedSiteLink from "@/components/PublishedSiteLink";

// A page's preview in the Artist App (see its route): a slim bar — back
// to Arrange Pages on this page, the page's name, publish and the
// published site — over the page.

const stayOpen = () => {};

export default function ArtistPagePreview({
  siteId,
  artistId,
  pageId,
  title,
  shown,
  contactPanel,
  lastPublishedAt,
}: {
  siteId: string;
  artistId: string;
  // The page previewed.
  pageId: string;
  title: string;
  // The page drawn (for the Contact panel page, the first Live page).
  shown: { id: string; curationId: string | null; style: PageStyleSummary | null } | null;
  contactPanel: ContactPanelSettings | null;
  lastPublishedAt: string | null;
}) {
  return (
    <div className="flex h-dvh flex-col bg-white">
      <div
        className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-1.5"
        style={{ fontFamily: ARTIST_APP_FONT }}
      >
        <Link
          href={artistAppPageHref(siteId, pageId)}
          prefetch={false}
          className="shrink-0 text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Pages
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-lg text-neutral-800">Preview — {title}</h1>
        <PublishButton siteId={siteId} lastPublishedAt={lastPublishedAt} />
        <PublishedSiteLink href={publishedHomePath(siteId)} />
      </div>
      {shown ? (
        <LiveSiteData siteId={siteId} artistId={artistId}>
          <ContactPanelProvider panel={contactPanel ? { settings: contactPanel, onClosed: stayOpen } : null}>
            <PagePreview pageId={shown.id} curationId={shown.curationId} style={shown.style} />
          </ContactPanelProvider>
        </LiveSiteData>
      ) : (
        <p className="p-8 text-center text-neutral-400">Nothing to preview.</p>
      )}
    </div>
  );
}
