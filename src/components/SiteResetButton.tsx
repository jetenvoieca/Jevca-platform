"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { resetSite, resetSiteContentRound, type ResetParts, type ResetResult } from "@/lib/actions/siteReset";

// Delete all (2026-11-03, Craig's request — admin only, for clearing a
// site to set it up again): a bin in the site header opening a window to
// tick what to delete from the site — see resetSite — then type DELETE
// to confirm. Artworks and media go in rounds, with a running count
// (2026-11-10). Says afterwards what went and what was kept.

const PARTS: { key: keyof ResetParts; label: string; detail: string }[] = [
  { key: "pages", label: "Pages", detail: "Every page — a clean start." },
  {
    key: "exhibitionsProfile",
    label: "Exhibitions & Profile",
    detail: "Every exhibition (archived too); Profile stories deleted, Statement, Biography and Galleries emptied.",
  },
  { key: "locations", label: "Locations", detail: "Every Location and its contact card (galleries etc.)." },
  {
    key: "artworks",
    label: "Artworks, curations & media",
    detail:
      "Every curation, artwork, Hopper item and Media Catalogue picture — for re-importing. Kept: artworks with a sale or at a Location (none at a Location if Locations is ticked too), and their pictures.",
  },
];

const NONE: ResetParts = { pages: false, exhibitionsProfile: false, locations: false, artworks: false };

type Counts = ResetResult & { artworks: number; media: number };

function deleted(r: Counts): string {
  const done = [
    r.pages && `${r.pages} pages`,
    r.exhibitions && `${r.exhibitions} exhibitions`,
    r.stories && `${r.stories} profile stories`,
    r.locations && `${r.locations} locations`,
    r.curations && `${r.curations} curations`,
    r.artworks && `${r.artworks} artworks`,
    r.media && `${r.media} pictures and videos`,
  ].filter(Boolean);
  return done.length ? `Deleted ${done.join(", ")}.` : "Nothing to delete.";
}

export default function SiteResetButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<ResetParts>(NONE);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const chosen = PARTS.some((p) => parts[p.key]);

  const close = () => {
    if (isPending) return;
    setOpen(false);
    setParts(NONE);
    setTyped("");
    setMessage(null);
  };

  const run = () => {
    startTransition(async () => {
      const first = await resetSite(siteId, parts);
      if ("error" in first) {
        setMessage(first.error);
        return;
      }
      const counts: Counts = { ...first, artworks: 0, media: 0 };
      let kept = "";
      if (parts.artworks) {
        for (;;) {
          setMessage(`Deleting… ${counts.artworks} artworks, ${counts.media} pictures and videos so far.`);
          const round = await resetSiteContentRound(siteId);
          if ("error" in round) {
            kept = ` Stopped: ${round.error}`;
            break;
          }
          counts.artworks += round.artworks;
          counts.media += round.media;
          if (round.done) {
            kept = ` Kept ${round.done.keptArtworks} artworks (sold or at a Location) and ${round.done.keptMedia} pictures and videos.`;
            break;
          }
        }
      }
      setMessage(deleted(counts) + kept);
      setParts(NONE);
      setTyped("");
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Delete all — clear this site's content (admin)"
        aria-label="Delete all"
        className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-neutral-100"
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2c3e6b" strokeWidth={1.8} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
            <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-1 text-lg font-semibold text-neutral-900">Delete all</h2>
              <p className="mb-4 text-sm text-neutral-600">
                Tick what to delete from this site. It can&apos;t be undone.
              </p>
              <div className="mb-4 flex flex-col gap-3">
                {PARTS.map((p) => (
                  <label key={p.key} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={parts[p.key]}
                      onChange={(e) => setParts({ ...parts, [p.key]: e.target.checked })}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{p.label}</span>
                      <span className="block text-xs text-neutral-500">{p.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="mb-4 flex flex-col gap-1 text-sm text-neutral-700">
                Type DELETE to confirm
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </label>
              {message && <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">{message}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={isPending}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={!chosen || typed.trim() !== "DELETE" || isPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {isPending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
