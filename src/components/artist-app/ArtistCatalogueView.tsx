"use client";

import type { ComponentProps } from "react";
import ArtworksCatalogueView from "@/app/sites/[id]/artworks/ArtworksCatalogueView";
import { SidePanel } from "@/components/artist-app/ArtistAppPanels";

// The Art manager's catalogue (2026-11-11, Craig's screenshot): the
// Artwork Catalogue's works, its two filters in the app's side panel in
// place of the pages.
export default function ArtistCatalogueView(props: ComponentProps<typeof ArtworksCatalogueView>) {
  return (
    <ArtworksCatalogueView
      {...props}
      sideFilters={(filters) => (
        <SidePanel>
          <div className="flex flex-col gap-3 pt-12">{filters}</div>
        </SidePanel>
      )}
    />
  );
}
