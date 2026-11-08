"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listArtworks, type ArtworkListRow } from "@/lib/actions/artworks";
import { FILTER_NONE } from "@/lib/artworkFilters";
import { artistAppHref } from "@/lib/artistApp";
import { MainPanel, SidePanel, WorkGrid, WorkTile } from "@/components/artist-app/ArtistAppPanels";

// Manage Works (2026-11-08, Craig's mockup): the works grid and its
// filters (All / Base works, Type). Add work and the exports are
// placeholders for later steps; clicking a work does nothing yet.

export default function ArtistWorksView({
  siteId,
  artistId,
  artworks: firstPage,
  total,
  pageSize,
  base,
  type,
  types,
}: {
  siteId: string;
  artistId: string;
  artworks: ArtworkListRow[];
  total: number;
  pageSize: number;
  // The address's filters: base "1" = Base works only; type a Type's
  // name, FILTER_NONE for none, "" for all.
  base: string;
  type: string;
  types: string[];
}) {
  const [artworks, setArtworks] = useState(firstPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMore = artworks.length < total;

  const loadMore = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { rows } = await listArtworks(artistId, {
        base,
        type,
        offset: artworks.length,
        limit: pageSize,
      });
      setArtworks((prev) => [...prev, ...rows]);
    } catch {
      // Stops the sentinel asking again; "Retry" below tries once more.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [artistId, base, type, artworks.length, pageSize]);

  // The next works load as the end of the grid comes near.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || failed || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, failed, loading, loadMore]);

  const href = (next: { base?: string; type?: string }) => {
    const params = new URLSearchParams();
    const b = next.base ?? base;
    const t = next.type ?? type;
    if (b) params.set("base", b);
    if (t) params.set("type", t);
    const query = params.toString();
    return `${artistAppHref(siteId)}${query ? `?${query}` : ""}`;
  };

  const typeLabel = type === FILTER_NONE ? "No type" : type;
  const heading = `${base ? "Base Works" : "All Works"}${typeLabel ? ` · ${typeLabel}` : ""}`;

  return (
    <>
      <MainPanel heading={heading}>
        {artworks.length === 0 ? (
          <p className="text-center text-neutral-400">No works</p>
        ) : (
          <WorkGrid>
            {artworks.map((a) => (
              <WorkTile key={a.id} work={a} />
            ))}
          </WorkGrid>
        )}
        {hasMore && (
          <div ref={sentinelRef} className="py-6 text-center text-sm text-neutral-400">
            {failed ? (
              <button type="button" onClick={loadMore} className="underline">
                Retry
              </button>
            ) : (
              "Loading…"
            )}
          </div>
        )}
      </MainPanel>

      <SidePanel>
        <FilterBox href={href({ base: "" })} selected={!base}>
          All Works
        </FilterBox>
        <FilterBox href={href({ base: "1" })} selected={!!base}>
          Base Works
        </FilterBox>
        <div className="max-h-72 min-h-48 overflow-y-auto border border-neutral-200 p-1">
          <TypeLink href={href({ type: "" })} selected={!type}>
            All types
          </TypeLink>
          <TypeLink href={href({ type: FILTER_NONE })} selected={type === FILTER_NONE}>
            No type
          </TypeLink>
          {types.map((t) => (
            <TypeLink key={t} href={href({ type: t })} selected={type === t}>
              {t}
            </TypeLink>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <PanelButton>Add work</PanelButton>
          <div className="flex flex-col">
            <PanelButton>Export as PDF</PanelButton>
            <PanelButton>Export as CSV</PanelButton>
          </div>
        </div>
      </SidePanel>
    </>
  );
}

function FilterBox({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      className={`border border-neutral-200 py-1.5 text-center text-xl font-medium text-neutral-900 ${
        selected ? "bg-[#E7E7E7]" : "hover:bg-neutral-50"
      }`}
    >
      {children}
    </Link>
  );
}

function TypeLink({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      className={`block truncate px-2 py-1 text-lg text-neutral-900 ${
        selected ? "bg-[#E7E7E7]" : "hover:bg-neutral-50"
      }`}
    >
      {children}
    </Link>
  );
}

// A placeholder for now (see the note at the top).
function PanelButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-disabled
      className="cursor-default border border-neutral-200 py-1.5 text-center text-xl text-neutral-900"
    >
      {children}
    </button>
  );
}
