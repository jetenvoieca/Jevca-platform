"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  getCuration,
  getCurationWorkPresentation,
  listCurationCovers,
  type CurationCover,
  type CurationDetail,
  type CurationWorkPresentation,
} from "@/lib/actions/curations";
import { listCurationSections } from "@/lib/actions/curationSections";
import { getPageCanvas, type CanvasPlacement } from "@/lib/actions/pageCanvas";
import { getPageComponents } from "@/lib/actions/pageComponents";
import { getPageSignupForms } from "@/lib/actions/signupForms";
import type { CurationSectionData } from "@/lib/curationSections";
import type { ComponentContent } from "@/lib/pageComponents";
import type { SignupFormContent } from "@/lib/signupForms";
import type { SiteSnapshot } from "@/lib/siteSnapshot";

// Where the page components (PagePreview, CanvasPlayer, CurationPanel,
// CurationWorkView, PageSectionsArranger) get their content from
// (2026-10-06): the same components draw both the admin preview — the
// site's working data, live — and the published site — its saved
// snapshot (lib/siteSnapshot.ts) — so a page only ever looks one way.
// Wrap them in LiveSiteData or SnapshotSiteData.
export type SiteData = {
  getCuration(curationId: string): Promise<CurationDetail | null>;
  listSections(curationId: string): Promise<CurationSectionData[]>;
  getPresentation(curationId: string, artworkId: string): Promise<CurationWorkPresentation | null>;
  getCanvas(pageId: string): Promise<CanvasPlacement[]>;
  // What fills a Block Build page's components (2026-10-07).
  getComponents(pageId: string): Promise<ComponentContent[]>;
  // A Block Build page's sign-up forms' wording (2026-10-10).
  getSignupForms(pageId: string): Promise<SignupFormContent[]>;
  listCovers(): Promise<CurationCover[]>;
  // Whether sign-up forms can be used (2026-10-10): only on the
  // published site, for its site, with the robot check's public key for
  // the address it's shown on (null = no check set up for it yet, so
  // signing up says it isn't available). Null in the admin preview,
  // where forms are only shown.
  signup: { siteId: string; siteKey: string | null } | null;
};

const SiteDataContext = createContext<SiteData | null>(null);

export function useSiteData(): SiteData {
  const data = useContext(SiteDataContext);
  if (!data) throw new Error("Page components must be inside LiveSiteData or SnapshotSiteData.");
  return data;
}

// The site's working data, read live — for the admin preview.
export function LiveSiteData({
  siteId,
  artistId,
  children,
}: {
  siteId: string;
  artistId: string;
  children: ReactNode;
}) {
  const data = useMemo<SiteData>(
    () => ({
      getCuration: (curationId) => getCuration(curationId, artistId),
      listSections: (curationId) => listCurationSections(curationId, artistId),
      getPresentation: (curationId, artworkId) =>
        getCurationWorkPresentation(curationId, artistId, artworkId),
      getCanvas: (pageId) => getPageCanvas(siteId, pageId),
      getComponents: (pageId) => getPageComponents(siteId, pageId),
      getSignupForms: (pageId) => getPageSignupForms(siteId, pageId),
      listCovers: () => listCurationCovers(artistId),
      signup: null,
    }),
    [siteId, artistId]
  );
  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}

// The site as last published — for the site's own pages. `siteKey` is
// the robot check's public key for the address the site is shown on.
export function SnapshotSiteData({
  siteId,
  siteKey,
  snapshot,
  children,
}: {
  siteId: string;
  siteKey: string | null;
  snapshot: SiteSnapshot;
  children: ReactNode;
}) {
  const data = useMemo<SiteData>(
    () => ({
      getCuration: async (curationId) => snapshot.curations[curationId]?.detail ?? null,
      listSections: async (curationId) => snapshot.curations[curationId]?.sections ?? [],
      getPresentation: async (curationId, artworkId) =>
        snapshot.curations[curationId]?.presentations[artworkId] ?? null,
      getCanvas: async (pageId) => snapshot.pages.find((p) => p.id === pageId)?.canvas ?? [],
      getComponents: async (pageId) =>
        snapshot.pages.find((p) => p.id === pageId)?.components ?? [],
      getSignupForms: async (pageId) =>
        snapshot.pages.find((p) => p.id === pageId)?.signupForms ?? [],
      listCovers: async () => snapshot.covers,
      signup: { siteId, siteKey },
    }),
    [snapshot, siteId, siteKey]
  );
  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}
