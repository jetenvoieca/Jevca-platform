"use client";

import { useRouter } from "next/navigation";
import PanelSelect from "@/components/PanelSelect";
import { SidePanel } from "@/components/artist-app/ArtistAppPanels";
import { artistAppHref } from "@/lib/artistApp";
import type { LocationSummary } from "@/lib/artworkSettingsData";
import type { ArtworkNameCount } from "@/lib/actions/artworks";

// The Art manager's side panel (2026-11-11, Craig's screenshots):
// Galleries / locations — choosing one opens it, as the admin's Locations
// (works there, details and sales); clearing it goes back to the works —
// and Artwork names, which shows every work of the name chosen (in place,
// or from a location back in the works).
export default function ArtManagerFilters({
  siteId,
  locations,
  location,
  names,
  name,
  onName,
}: {
  siteId: string;
  locations: LocationSummary[];
  // The open location's contact card id, or "".
  location: string;
  names: ArtworkNameCount[];
  name: string;
  // Filters the works in place; without it the works open at that name.
  onName?: (name: string) => void;
}) {
  const router = useRouter();
  const works = artistAppHref(siteId, "artworks");
  return (
    <SidePanel>
      <div className="flex min-h-0 flex-1 flex-col gap-3 pt-12">
        <PanelSelect
          value={location}
          placeholder="Galleries / locations"
          options={locations.map((l) => ({ value: l.customerId, label: l.name }))}
          onChange={(v) =>
            router.push(v ? `${artistAppHref(siteId, "artworks/locations")}?location=${encodeURIComponent(v)}` : works)
          }
        />
        <PanelSelect
          value={name}
          placeholder="Artwork names"
          options={[
            ...(name && !names.some((n) => n.name === name) ? [{ value: name, label: name }] : []),
            ...names.map((n) => ({ value: n.name, label: `${n.name} (${n.count})` })),
          ]}
          onChange={(v) => (onName ? onName(v) : router.push(v ? `${works}?name=${encodeURIComponent(v)}` : works))}
        />
      </div>
    </SidePanel>
  );
}
