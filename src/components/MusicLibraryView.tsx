"use client";

import { useRef, useState } from "react";
import MediaCatalogueTabs from "@/components/MediaCatalogueTabs";
import { putToR2 } from "@/lib/putToR2";
import { addMusicTrack, deleteMusicTrack, renameMusicTrack, requestMusicUpload } from "@/lib/actions/music";
import { MUSIC_ACCEPT, type MusicTrackRow } from "@/lib/musicTracks";

// The Media Catalogue's Music view (2026-10-16): the artist's own
// royalty-free tracks, for Video Edit's soundtrack. Upload (MP3, M4A,
// WAV — several at once), listen, rename, delete.

function formatLength(seconds: number | null): string {
  if (seconds == null) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The file's length, read by the browser; null if it can't tell.
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

export default function MusicLibraryView({
  siteId,
  artistId,
  initialTracks,
}: {
  siteId: string;
  artistId: string;
  initialTracks: MusicTrackRow[];
}) {
  const [tracks, setTracks] = useState(initialTracks);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const step = await requestMusicUpload(artistId, file.name, file.type);
        if ("error" in step) throw new Error(step.error);
        await putToR2(step.uploadUrl, file, file.type);
        const track = await addMusicTrack(artistId, {
          key: step.key,
          name: file.name.replace(/\.[^.]+$/, ""),
          mimeType: file.type,
          durationSeconds: await readDuration(file),
        });
        if ("error" in track) throw new Error(track.error);
        setTracks((prev) => [...prev, track].sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : "couldn't be uploaded."}`);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const rename = (id: string, name: string) => {
    if (!name.trim()) return;
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));
    renameMusicTrack(artistId, id, name);
  };

  const remove = async (track: MusicTrackRow) => {
    if (!confirm(`Delete "${track.name}"?`)) return;
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
    await deleteMusicTrack(artistId, track.id);
  };

  return (
    <div className="px-6 py-4">
      <div className="sticky top-0 z-10 -mt-4 space-y-3 border-b border-neutral-200 bg-white pb-3 pt-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Media Catalogue</h1>
        <div className="flex flex-wrap items-center gap-3">
          <MediaCatalogueTabs siteId={siteId} current="music" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading != null}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {uploading ? `Uploading ${uploading}…` : "Upload music"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={MUSIC_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </div>

      <p className="mb-3 mt-3 text-sm text-neutral-400">
        Royalty-free tracks you own or have bought — Instagram mutes videos with copyrighted songs. MP3, M4A or WAV.
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {tracks.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No music yet.</p>
      ) : (
        <div className="max-w-3xl divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {tracks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <input
                defaultValue={t.name}
                onBlur={(e) => e.target.value !== t.name && rename(t.id, e.target.value)}
                className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 text-sm hover:border-neutral-200 focus:border-neutral-300"
              />
              <span className="w-12 text-right text-xs text-neutral-400">{formatLength(t.durationSeconds)}</span>
              <audio src={t.url} controls preload="none" className="h-8" />
              <button
                type="button"
                onClick={() => remove(t)}
                className="text-xs text-neutral-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
