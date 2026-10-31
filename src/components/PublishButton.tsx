"use client";

import { useEffect, useState, useTransition } from "react";
import { publishSite } from "@/lib/actions/siteSnapshot";
import { formatDateTime } from "@/lib/formatDate";

// Publish the site — an icon beside the published-site globe (2026-10-31,
// Craig's mockup: replaces the "Publish to live site" button and its
// "Last published" line in the menu). One click publishes. It spins
// while publishing, then shows a green tick for a few seconds; hovering
// says when the site was last published. A warning or error shows in a
// small note under the icons until closed or the next publish. Each
// publish is kept in the site's publish log (see publishSite).
const TICK_MS = 3000;

export default function PublishButton({
  siteId,
  lastPublishedAt,
}: {
  siteId: string;
  // ISO date, or null if never published.
  lastPublishedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  // Set by a publish in this visit; otherwise the date from the server.
  const [publishedNow, setPublishedNow] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "warning"; text: string } | null>(null);

  useEffect(() => {
    if (!justPublished) return;
    const timer = setTimeout(() => setJustPublished(false), TICK_MS);
    return () => clearTimeout(timer);
  }, [justPublished]);

  const publish = () => {
    setNote(null);
    setJustPublished(false);
    startTransition(async () => {
      try {
        const result = await publishSite(siteId);
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
        } else {
          setPublishedNow(result.publishedAt);
          setJustPublished(true);
          if (result.warning) setNote({ kind: "warning", text: result.warning });
        }
      } catch {
        setNote({ kind: "error", text: "Publishing failed — please try again." });
      }
    });
  };

  const shown = publishedNow ?? lastPublishedAt;
  const label = pending
    ? "Publishing…"
    : `Publish to live site — ${shown ? `last published ${formatDateTime(shown)}` : "not published yet"}`;

  return (
    <div className="relative flex">
      <button
        type="button"
        onClick={publish}
        disabled={pending}
        title={label}
        aria-label={label}
        className="inline-flex shrink-0 rounded-full p-0.5 hover:bg-neutral-100 disabled:cursor-wait"
      >
        {pending ? (
          <span className="flex h-[34px] w-[34px] items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#2c3e6b]/25 border-t-[#2c3e6b]" />
          </span>
        ) : justPublished ? (
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10.5" className="fill-green-600" />
            <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10.5" fill="#2c3e6b" />
            <path d="M12 17.5V8M7.5 12l4.5-4.5 4.5 4.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {note && !pending && (
        <div
          role={note.kind === "error" ? "alert" : "status"}
          className={`absolute right-0 top-full z-30 mt-1 flex w-64 items-start gap-2 rounded-md border bg-white px-3 py-2 text-xs shadow-md ${
            note.kind === "error" ? "border-red-200 text-red-600" : "border-amber-200 text-amber-700"
          }`}
        >
          <p className="flex-1">{note.text}</p>
          <button
            type="button"
            onClick={() => setNote(null)}
            aria-label="Close"
            className="shrink-0 text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
