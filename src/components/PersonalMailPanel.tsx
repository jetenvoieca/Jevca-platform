"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGmail } from "@/lib/actions/gmail";

// The Inbox's Personal tab (2026-10-09): Craig's own Gmail. Step 1 is the
// connection itself — Connect Gmail sends the browser to Google (see
// /api/gmail/connect); once connected it shows which account, with
// Disconnect.
export default function PersonalMailPanel({
  gmail,
  error,
}: {
  gmail: { email: string } | null;
  error: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDisconnect = () => {
    if (!confirm("Disconnect Gmail? Your emails stay in Gmail; they just stop showing here until you connect again.")) {
      return;
    }
    startTransition(async () => {
      await disconnectGmail();
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {gmail ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-700">
            Connected to <span className="font-medium text-neutral-900">{gmail.email}</span>
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-neutral-600">Show your Gmail here, and reply from it.</p>
          {/* A plain link, not router navigation — it leaves the app for Google. */}
          <a
            href="/api/gmail/connect"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Connect Gmail
          </a>
        </div>
      )}
    </div>
  );
}
