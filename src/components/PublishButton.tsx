"use client";

import { useEffect, useState, useTransition } from "react";
import type { PublishResult } from "@/lib/siteSnapshot";
import { formatDateTime } from "@/lib/formatDate";

// "Publish to live site" (2026-10-06): shows "Publishing…" while it
// runs, then when the site was published, or what went wrong. Below the
// button, when the site was last published (or "Not published yet"),
// so it's always clear how current the live site is. Without an action
// (pages with nothing to publish) it's just the disabled button.
export default function PublishButton({
  action,
  enabled,
  lastPublishedAt,
}: {
  action?: () => Promise<PublishResult>;
  enabled: boolean;
  // ISO date, or null if never published.
  lastPublishedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  // Set by a publish in this visit; otherwise the date from the server.
  const [publishedNow, setPublishedNow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Published, but something on the site won't work yet (2026-10-10).
  const [warning, setWarning] = useState<string | null>(null);
  // Dates are shown in the viewer's own time zone, so only once in the
  // browser — the server doesn't know it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const publish = () => {
    if (!action) return;
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const result = await action();
        if ("error" in result) setError(result.error);
        else {
          setPublishedNow(result.publishedAt);
          setWarning(result.warning ?? null);
        }
      } catch {
        setError("Publishing failed — please try again.");
      }
    });
  };

  const shown = publishedNow ?? lastPublishedAt;
  let status: string | null = null;
  if (action && mounted) {
    if (pending) status = "Saving the whole site…";
    else if (shown) status = `${publishedNow ? "Published" : "Last published"} ${formatDateTime(shown)}`;
    else status = "Not published yet";
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={publish}
        disabled={!enabled || !action || pending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:hover:bg-neutral-200"
      >
        {pending ? "Publishing…" : "Publish to live site"}
      </button>
      {error ? (
        <p className="text-center text-xs text-red-600">{error}</p>
      ) : (
        status && (
          <p
            className={`text-center text-xs ${
              publishedNow && !pending ? "text-green-700" : "text-neutral-500"
            }`}
          >
            {status}
          </p>
        )
      )}
      {warning && !pending && <p className="text-center text-xs text-amber-700">{warning}</p>}
    </div>
  );
}
