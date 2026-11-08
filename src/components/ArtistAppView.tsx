"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listArtworks, type ArtworkListRow } from "@/lib/actions/artworks";
import { FILTER_NONE } from "@/lib/artworkFilters";
import { ARTIST_APP_FONT } from "@/lib/artistApp";
import BaseStar from "@/components/BaseStar";

// The Artist App's screen (2026-11-08, Craig's mockup): in one grey frame,
// the works grid, its filters (All / Base works, Type) and the app's
// buttons. Add work, the exports and every button on the right are
// placeholders for later steps; clicking a work does nothing yet.

const APP_BUTTONS = ["Manage Works", "Arrange Pages", "Update CV", "Exhibition", "Consignment"];
const BUTTON_COLOR = "#FBF7EE";
const CONCIERGE_COLOR = "#FAE8C3";

export default function ArtistAppView({
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
    return `/sites/${siteId}/artist-app${query ? `?${query}` : ""}`;
  };

  const typeLabel = type === FILTER_NONE ? "No type" : type;
  const heading = `${base ? "Base Works" : "All Works"}${typeLabel ? ` · ${typeLabel}` : ""}`;

  return (
    <div className="p-6 lg:h-full" style={{ fontFamily: ARTIST_APP_FONT }}>
      <div className="flex flex-col gap-4 rounded-[28px] bg-[#F2F2F2] p-4 lg:h-full lg:flex-row">
        {/* The works */}
        <section className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-8 py-8 lg:overflow-y-auto">
          <h2 className="mx-auto mb-8 w-fit min-w-[50%] border border-neutral-200 px-6 py-1.5 text-center text-2xl text-neutral-800">
            {heading}
          </h2>
          {artworks.length === 0 ? (
            <p className="text-center text-neutral-400">No works</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
              {artworks.map((a) => (
                <div key={a.id} className="min-w-0">
                  {a.imageUrl ? (
                    <img
                      src={a.imageUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full rounded-sm object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-sm bg-neutral-100" />
                  )}
                  <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-neutral-800">{a.catalogueName}</span>
                    <span className="shrink-0 text-neutral-400">
                      <BaseStar isBase={a.isBase} />#{a.catalogueNumber}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
        </section>

        {/* Filters */}
        <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-3 lg:w-[340px]">
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
        </section>

        {/* The app's buttons */}
        <nav className="flex shrink-0 flex-col gap-3 lg:w-[200px]">
          {APP_BUTTONS.map((label) => (
            <AppButton key={label} color={BUTTON_COLOR}>
              {label}
            </AppButton>
          ))}
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <AppButton color={CONCIERGE_COLOR}>Concierge</AppButton>
            <AppButton color={BUTTON_COLOR}>Upgrade</AppButton>
          </div>
        </nav>
      </div>
    </div>
  );
}

function FilterBox({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
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

function TypeLink({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
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

// A placeholder for now (see the note at the top).
function AppButton({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-disabled
      style={{ backgroundColor: color }}
      className="h-24 cursor-default rounded-2xl border border-neutral-300 px-5 text-left text-2xl font-light text-neutral-500"
    >
      {children}
    </button>
  );
}
