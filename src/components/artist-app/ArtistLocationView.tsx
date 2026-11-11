"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import GalleriesView from "@/components/GalleriesView";
import ArtManagerFilters from "@/components/artist-app/ArtManagerFilters";
import { artistAppHref } from "@/lib/artistApp";
import type { ArtworkNameCount } from "@/lib/actions/artworks";

// A location in the Art manager (2026-11-11, Craig's request): the
// admin's Locations for that one — the works there, its details and
// sales — with the Art manager's side panel. Close goes back to the works.
export default function ArtistLocationView({
  location,
  names,
  ...props
}: Omit<ComponentProps<typeof GalleriesView>, "embedded"> & { location: string; names: ArtworkNameCount[] }) {
  const router = useRouter();
  const works = artistAppHref(props.siteId, "artworks");
  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white">
        <GalleriesView key={location} {...props} embedded={{ onClose: () => router.push(works) }} />
      </div>
      <ArtManagerFilters
        siteId={props.siteId}
        locations={props.settings.locations}
        location={location}
        names={names}
        name=""
      />
    </>
  );
}
