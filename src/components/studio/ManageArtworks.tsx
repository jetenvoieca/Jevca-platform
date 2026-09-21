"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { consignArtwork, fetchStudioArtworks } from "@/lib/studioApi";
import type { StudioArtworkTile } from "@/lib/studioArtworks";
import { fieldCls, NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Manage existing": pick one of the artist's existing artworks, then
// mark it Sold (later step) or Consign it. Screens follow the design
// mock-ups: catalogue grid (with a search box that opens above the
// buttons) → the chosen artwork with Sold / Consigned → the list of
// locations to consign it to.

const SEARCH_DEBOUNCE_MS = 350;

type Screen = "catalogue" | "artwork" | "consign";

function soldMessage(availability: StudioArtworkTile["availability"]): string {
  return availability === "SOLD"
    ? "That work is already sold."
    : "That work is already sold, payment still due.";
}

export default function ManageArtworks({
  token,
  locations,
  onDone,
  onBusyChange,
}: {
  token: string;
  // The artist's own Locations list from Settings — what a work can be
  // consigned to.
  locations: string[];
  // Called once a change has been saved — the app returns to its first
  // screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while a change is being saved.
  onBusyChange: (busy: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>("catalogue");
  const [artworks, setArtworks] = useState<StudioArtworkTile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<StudioArtworkTile | null>(null);
  const [chosenLocation, setChosenLocation] = useState<string | null>(null);
  const [consigning, setConsigning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Only the newest request may update the list — typing fires several in
  // quick succession and they can finish out of order.
  const requestRef = useRef(0);
  // The search the list on screen belongs to, so "load more" always
  // continues that list even while a newer search is still being typed.
  const queryRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const runQuery = useCallback(
    async (query: string, offset: number) => {
      const id = ++requestRef.current;
      if (offset === 0) queryRef.current = query;
      setLoading(true);
      setLoadError(false);
      try {
        const result = await fetchStudioArtworks(token, query, offset);
        if (id !== requestRef.current) return;
        setArtworks((prev) => (offset === 0 ? result.artworks : [...prev, ...result.artworks]));
        setTotal(result.total);
      } catch {
        if (id === requestRef.current) setLoadError(true);
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void runQuery("", 0);
  }, [runQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Infinite scroll: when the marker just past the last tile scrolls into
  // view, fetch the next page.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadError || artworks.length >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void runQuery(queryRef.current, artworks.length);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [artworks.length, total, loading, loadError, runQuery]);

  const go = (next: Screen) => {
    setNotice(null);
    setScreen(next);
  };

  const searchFor = (value: string) => {
    setQ(value);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runQuery(value.trim(), 0), SEARCH_DEBOUNCE_MS);
  };

  // Opens or closes the search box. The keyboard only appears once the
  // artist taps into the box — opening it and raising the keyboard in the
  // same tap left the box hidden behind the keyboard on iPhone.
  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      if (q) searchFor("");
      return;
    }
    setSearchOpen(true);
  };

  const onTile = (artwork: StudioArtworkTile) => {
    if (artwork.availability !== "AVAILABLE") {
      setNotice({ text: soldMessage(artwork.availability), tone: "info" });
      return;
    }
    setNotice(null);
    setSelected(artwork);
  };

  const onSelect = () => {
    if (!selected) {
      setNotice({ text: "Tap an artwork first.", tone: "info" });
      return;
    }
    go("artwork");
  };

  const comingSoon = () => setNotice({ text: "Coming soon", tone: "info" });

  const consign = async () => {
    if (!selected) return;
    if (!chosenLocation) {
      setNotice({ text: "Choose a gallery first.", tone: "info" });
      return;
    }

    setConsigning(true);
    onBusyChange(true);
    setNotice({ text: "Consigning…", tone: "info" });
    try {
      await consignArtwork(token, selected.id, chosenLocation);
      onDone({ text: `Consigned to ${chosenLocation}`, tone: "info" });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't consign. Please try again.",
        tone: "error",
      });
    } finally {
      setConsigning(false);
      onBusyChange(false);
    }
  };

  if (screen === "artwork" && selected) {
    return (
      <>
        <section className={`${panelCls} aspect-square overflow-hidden p-2`}>
          {selected.displayUrl ? (
            <img
              src={selected.displayUrl}
              alt={selected.title}
              className="h-full w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#8a8a8a]">
              No image
            </div>
          )}
        </section>
        <NoticeLine notice={notice} />
        <section className={`${panelCls} p-4`}>
          <div className="flex gap-4">
            <StudioButton onClick={comingSoon}>Sold</StudioButton>
            <StudioButton onClick={() => go("consign")}>Consigned</StudioButton>
          </div>
        </section>
      </>
    );
  }

  if (screen === "consign" && selected) {
    return (
      <>
        <section className="aspect-square overflow-y-auto rounded-lg border border-[#cfcac0] bg-white">
          {locations.length === 0 ? (
            <p className="p-6 text-center text-[#8a8a8a]">No locations set up yet.</p>
          ) : (
            locations.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setChosenLocation(name)}
                disabled={consigning}
                className={`block w-full border-b border-[#e5e5e5] px-4 py-4 text-left text-lg text-[#333] ${
                  chosenLocation === name ? "bg-[#e6e6e6]" : ""
                }`}
              >
                {name}
              </button>
            ))
          )}
        </section>
        <NoticeLine notice={notice} />
        <section className={`${panelCls} p-4`}>
          <div className="flex gap-4">
            <StudioButton onClick={consign} disabled={consigning}>
              Consign to gallery
            </StudioButton>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className={`${panelCls} aspect-square overflow-y-auto p-3`}>
        <div className="grid grid-cols-3 gap-3">
          {artworks.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onTile(a)}
              className={`block w-full rounded-lg border-2 p-1 text-left ${
                selected?.id === a.id ? "border-[#5a5a5a]" : "border-transparent"
              }`}
            >
              <div className="relative">
                {a.thumbnailUrl ? (
                  <img
                    src={a.thumbnailUrl}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md bg-white text-xs text-[#8a8a8a]">
                    No image
                  </div>
                )}
                {a.availability !== "AVAILABLE" && (
                  <span className="absolute right-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-medium uppercase text-white">
                    {a.availability === "SOLD" ? "Sold" : "Not Paid"}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[13px] text-[#333]">{a.title}</p>
              {a.typeEdition && <p className="text-xs text-[#8a8a8a]">{a.typeEdition}</p>}
              {a.group && <p className="truncate text-xs text-[#b0b0b0]">{a.group}</p>}
            </button>
          ))}
        </div>

        {loading && artworks.length === 0 && (
          <p className="py-8 text-center text-[#8a8a8a]">Loading…</p>
        )}
        {!loading && !loadError && artworks.length === 0 && (
          <p className="py-8 text-center text-[#8a8a8a]">No artworks found</p>
        )}
        {loadError && (
          <button
            type="button"
            onClick={() => void runQuery(queryRef.current, artworks.length)}
            className="block w-full py-4 text-center text-red-700"
          >
            Couldn&apos;t load. Tap to try again.
          </button>
        )}
        <div ref={sentinelRef} className="h-1" />
      </section>

      <NoticeLine notice={notice} />

      <div>
        {searchOpen && (
          <div className="animate-studio-slide-down pb-4">
            <input
              type="text"
              placeholder="Title / name"
              aria-label="Title / name"
              autoComplete="off"
              enterKeyHint="search"
              value={q}
              onChange={(e) => searchFor(e.target.value)}
              // Return closes the keyboard so the Select button is visible again.
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className={`${fieldCls} text-[#555] placeholder:text-[#8a8a8a]`}
            />
          </div>
        )}

        <section className={`${panelCls} p-4`}>
          <div className="flex gap-4">
            <StudioButton onClick={toggleSearch}>Search</StudioButton>
            <StudioButton onClick={onSelect}>Select</StudioButton>
          </div>
        </section>
      </div>

      {/* Spare room below while searching. The page is otherwise exactly one
          screen tall, so when the keyboard opens iPhone has nowhere to scroll
          the search box to and leaves it hidden behind the keyboard. */}
      {searchOpen && <div aria-hidden className="h-[45dvh] shrink-0" />}
    </>
  );
}
