"use client";

import { useEffect, useState } from "react";
import { findGalleryArtists } from "@/lib/actions/marketingContacts";
import type { MarketingArtistFind, MarketingContactRow } from "@/lib/marketingContacts";
import FormModal from "@/components/FormModal";

// Contacts → a gallery's artists (2026-11-07, Craig's request): opened
// from the artist icon on a gallery's tile, looks up the artists its
// website lists (findGalleryArtists) and shows them as thumbnails, each
// linking to the artist's page on the gallery's site. Only shown, not
// saved — it looks again each time.

export default function MarketingGalleryArtists({
  gallery,
  onClose,
}: {
  gallery: MarketingContactRow;
  onClose: () => void;
}) {
  const [find, setFind] = useState<MarketingArtistFind | null>(null);

  useEffect(() => {
    let open = true;
    findGalleryArtists(gallery.id)
      .catch((): MarketingArtistFind => ({ found: false, reason: "Something went wrong looking." }))
      .then((f) => open && setFind(f));
    return () => {
      open = false;
    };
  }, [gallery.id]);

  return (
    <FormModal title={`${gallery.name} — artists`} busy={false} onClose={onClose}>
      {!find ? (
        <p className="text-sm text-neutral-500">Looking at the gallery&apos;s website…</p>
      ) : !find.found ? (
        <p className="text-sm text-neutral-500">{find.reason}</p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            {find.artists.length} from{" "}
            <a href={find.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {find.source}
            </a>
          </p>
          <div className="grid grid-cols-3 gap-3">
            {find.artists.map((a) => {
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
