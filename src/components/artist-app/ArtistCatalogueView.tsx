"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import ArtworksCatalogueView from "@/app/sites/[id]/artworks/ArtworksCatalogueView";
import { BandTools, PanelHeading, SidePanel } from "@/components/artist-app/ArtistAppPanels";
import { useClientWords } from "@/components/ClientWordsProvider";

// The Art manager's catalogue (2026-11-11, Craig's screenshots): the
// Artwork Catalogue's works under its heading and "+ Add Artwork"; its
// export / import menu and layout button in the app's top band; Galleries
// / locations and Artwork names in the side panel in place of the pages.
export default function ArtistCatalogueView(props: ComponentProps<typeof ArtworksCatalogueView>) {
  const words = useClientWords();
  return (
    <ArtworksCatalogueView
      {...props}
      appSlots={({ filters, tools, addHref }) => (
        <>
          <div className="pt-4">
            <PanelHeading
              aside={
                <Link
                  href={addHref}
                  prefetch={false}
                  className="flex items-center whitespace-nowrap border border-neutral-200 px-4 py-1.5 text-2xl text-neutral-800 hover:bg-neutral-50"
                >
                  + Add {words.item}
                </Link>
              }
            >
              {words.catalogue}
            </PanelHeading>
          </div>
          <BandTools>{tools}</BandTools>
          <SidePanel>
            <div className="flex flex-col gap-3 pt-12">{filters}</div>
          </SidePanel>
        </>
      )}
    />
  );
}
