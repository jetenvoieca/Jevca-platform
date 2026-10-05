"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getCuration, type CurationDetail } from "@/lib/actions/curations";

// The Pages page's Preview panel (2026-10-04): the selected page's
// curation as a simple grid — each work's main image in that curation
// and its name, in the curation's own order — with the curation's
// Description (2026-10-05, plain text) in a box beside the works, as on
// the Curations page. A stand-in until Display Styles exist; then this
// shows the page in its chosen style.
export default function PagePreview({
  artistId,
  title,
  curationId,
}: {
  artistId: string;
  title: string;
  curationId: string | null;
}) {
  const [curation, setCuration] = useState<CurationDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!curationId) {
      setCuration(null);
      return;
    }
    // Ignores a reply that arrives after a different page was selected.
    let current = true;
    setLoading(true);
    getCuration(curationId, artistId).then((detail) => {
      if (!current) return;
      setCuration(detail);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [curationId, artistId]);

  let body: ReactNode;
  if (!curationId) {
    body = <Message text="This page has no curation. Choose one with Edit." />;
  } else if (loading) {
    body = <Message text="Loading…" />;
  } else if (!curation) {
    body = <Message text="This page's curation could not be found." />;
  } else {
    body = (
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          {curation.works.length === 0 ? (
            <Message text={`"${curation.name}" has no works yet.`} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] items-start gap-4">
              {curation.works.map((w) => (
                <figure key={w.artworkId}>
                  <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
                    {w.imageUrl ? (
                      <img
                        src={w.imageUrl}
                        alt={w.catalogueName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>
                  <figcaption className="mt-1.5 truncate text-sm text-neutral-800">
                    {w.catalogueName}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="w-[27%] min-w-[14rem] shrink-0 rounded-xl border border-neutral-300 p-4">
          <h4 className="mb-2 text-center text-lg text-neutral-900">Description</h4>
          {curation.description ? (
            <p className="whitespace-pre-line break-words text-sm text-neutral-800">
              {curation.description}
            </p>
          ) : (
            <p className="text-center text-sm text-neutral-400">No description yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-4 mt-2 text-center text-xl text-neutral-900">{title}</h3>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{text}</p>;
}
