"use client";

import { useTransition } from "react";
import { disconnectInstagram } from "@/lib/actions/instagram";
import { formatDate } from "@/lib/formatDate";

// The artist's Instagram, for posting from the Social page (2026-10-15):
// Connect (to Instagram's sign-in, see /api/instagram/connect), or the
// connected account with Disconnect. `error` is why a connection just
// failed, if it did.
export default function InstagramSettingsCard({
  artistId,
  siteId,
  account,
  error,
}: {
  artistId: string;
  siteId: string;
  account: { username: string; expiresAt: string; renewError: string | null } | null;
  error: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const disconnect = () => {
    if (!confirm(`Disconnect @${account?.username}? Posting will stop until it's connected again.`)) return;
    startTransition(() => disconnectInstagram(artistId, siteId));
  };

  return (
    <div className="max-w-md rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">Instagram</h3>
      <p className="mb-3 text-xs text-neutral-500">
        The account the Social page posts to. It must be a professional (Business or Creator) account.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {account ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-neutral-900">@{account.username}</p>
            {new Date(account.expiresAt) < new Date() ? (
              <p className="text-xs text-red-600">The connection has run out — disconnect and connect again.</p>
            ) : (
              <p className="text-xs text-neutral-400">
                Renews itself every week · valid until {formatDate(account.expiresAt)}
              </p>
            )}
            {account.renewError && (
              <p className="text-xs text-red-600">Last renewal failed: {account.renewError}</p>
            )}
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={disconnect}
            className="shrink-0 text-xs text-neutral-500 hover:text-red-600 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <a
          href={`/api/instagram/connect?siteId=${siteId}`}
          className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Connect Instagram
        </a>
      )}
    </div>
  );
}
