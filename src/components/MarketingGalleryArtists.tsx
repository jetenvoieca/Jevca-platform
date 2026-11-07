"use client";

import { useEffect, useState } from "react";
import {
  fillGalleryArtistPictures,
  findGalleryArtistsPage,
  getGalleryArtists,
  readGalleryArtists,
} from "@/lib/actions/marketingContacts";
import type { MarketingContactRow, MarketingSavedArtists } from "@/lib/marketingContacts";
import FormModal from "@/components/FormModal";

// Contacts → a gallery's artists (2026-11-07, Craig's request): opened
// from the artist icon on a gallery's tile, shows the artists its website
// lists as thumbnails, each linking to the artist's page on the gallery's
// site. What was found last time is kept and shown, with when; Update
// looks again (findGalleryArtistsPage, then readGalleryArtists), as does
// opening a gallery never looked up. Either step is tried again through
// the page-reading service when reading the site directly fails (see
// artistFinder.ts) — which costs credits, hence keeping the results.
// Artists the artists page showed no picture for then get one from their
// own page, a batch at a time (fillGalleryArtistPictures).

const checkedOn = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function MarketingGalleryArtists({
  gallery,
  onClose,
}: {
  gallery: MarketingContactRow;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<MarketingSavedArtists | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [looking, setLooking] = useState(false);
  // Reading the site through the page-reading service.
  const [harder, setHarder] = useState(false);
  // Why the last look found nothing.
  const [problem, setProblem] = useState("");
  const [fillingPictures, setFillingPictures] = useState(false);

  const fillPictures = async () => {
    setFillingPictures(true);
    try {
      for (let from: number | null = 0; from !== null; ) {
        const filled = await fillGalleryArtistPictures(gallery.id, from);
        if (!filled) break;
        setSaved(filled.saved);
        from = filled.next;
      }
    } catch {
      // The pictures are a nicety; the list is already kept.
    } finally {
      setFillingPictures(false);
    }
  };

  const look = async () => {
    setLooking(true);
    setHarder(false);
    setProblem("");
    try {
      let viaService = false;
      let page = await findGalleryArtistsPage(gallery.id);
      if (!page.found && page.tryHarder) {
        setHarder((viaService = true));
        page = await findGalleryArtistsPage(gallery.id, true);
      }
      if (!page.found) return setProblem(page.reason);
      let artists = await readGalleryArtists(gallery.id, page.pageUrl, page.shopify, viaService);
      if (!artists.found && artists.tryHarder) {
        setHarder(true);
        artists = await readGalleryArtists(gallery.id, page.pageUrl, page.shopify, true);
      }
      if (!artists.found) return setProblem(artists.reason);
      setSaved(artists);
      if (artists.artists.some((a) => !a.image && a.url)) fillPictures();
    } catch {
      setProblem("Something went wrong looking.");
    } finally {
      setLooking(false);
    }
  };

  useEffect(() => {
    getGalleryArtists(gallery.id)
      .catch(() => null)
      .then((kept) => {
        setLoaded(true);
        if (kept) setSaved(kept);
        else look();
      });
    // Once, for the gallery the window opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormModal title={`${gallery.name} — artists`} busy={false} onClose={onClose}>
      {looking ? (
        <p className="text-sm text-neutral-500">
          {harder ? "Looking harder — opening the site in a browser…" : "Looking at the gallery's website…"}
        </p>
      ) : (
        problem && <p className="text-sm text-neutral-500">{problem}</p>
      )}
      {loaded && !looking && (
        <button
          type="button"
          onClick={look}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Update
        </button>
      )}
      {saved && (
        <>
          <p className="text-xs text-neutral-500">
            {saved.artists.length} from{" "}
            <a href={saved.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {saved.source}
            </a>
            , checked {checkedOn(saved.checkedAt)}
            {fillingPictures && " — getting pictures from the artists' pages…"}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {saved.artists.map((a) => {
              const card = (
                <>
                  <Thumbnail url={a.image} />
                  <p className="mt-1 break-words text-xs text-neutral-800">{a.name}</p>
                </>
              );
              return a.url ? (
                <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80">
                  {card}
                </a>
              ) : (
                <div key={a.name}>{card}</div>
              );
            })}
          </div>
        </>
      )}
    </FormModal>
  );
}

// An artist's picture from the gallery's site — a grey square when
// there's none or it won't load.
function Thumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="aspect-square w-full overflow-hidden rounded-md bg-neutral-100">
      {url && !failed && (
        // A link to another site, so not next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
