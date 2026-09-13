"use client";

import { useState, useTransition } from "react";
import { wipeArtistContent } from "@/lib/actions/wipeTestData";

export default function WipeTestDataForm({
  artistId,
  artistName,
}: {
  artistId: string;
  artistName: string;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const canDelete = confirmText.trim() === artistName && !isPending && !result?.ok;

  const handleDelete = () => {
    if (!canDelete) return;
    if (!confirm(`Really delete every artwork and media item for "${artistName}"? This can't be undone.`)) {
      return;
    }
    startTransition(async () => {
      const res = await wipeArtistContent(artistId);
      setResult(res.ok ? { ok: true, message: res.summary } : { ok: false, message: res.error });
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border-2 border-red-300 bg-red-50 p-6">
      <h1 className="text-lg font-semibold text-red-800">Danger zone — one-time cleanup</h1>
      <p className="text-sm text-red-700">
        This permanently deletes every artwork and every Media Catalogue image/video for{" "}
        <strong>{artistName}</strong>, along with any test sales, payments, and customers tied to
        those artworks. There is no undo.
      </p>

      {result ? (
        <p className={`text-sm font-medium ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.ok ? `Done. ${result.message}` : result.message}
        </p>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-red-800">
              Type &ldquo;{artistName}&rdquo; to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Deleting…" : "Delete everything"}
          </button>
        </>
      )}
    </div>
  );
}
