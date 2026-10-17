"use client";

import type { MusicTrackRow } from "@/lib/musicTracks";
import type { TimelineMusic } from "@/lib/videoTimeline";
import { PANEL_ROWS, PANEL_SELECT } from "@/components/videoEditorUi";

// Video Edit's music (2026-10-16; its own panel since 2026-10-17): one
// track from the artist's Music library under the whole video, fading in
// and out, and whether the clips' own sound is muted.

export default function MusicControl({
  siteId,
  tracks,
  music,
  muteClips,
  onChange,
}: {
  siteId: string;
  tracks: MusicTrackRow[];
  music: TimelineMusic | null;
  muteClips: boolean;
  onChange: (music: TimelineMusic | null, muteClips: boolean) => void;
}) {
  const track = music ? (tracks.find((t) => t.id === music.trackId) ?? null) : null;

  return (
    <div className={`${PANEL_ROWS} max-w-2xl`}>
      <span>Source</span>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={music?.trackId ?? ""}
          onChange={(e) =>
            onChange(e.target.value ? { trackId: e.target.value, volume: music?.volume ?? 0.8 } : null, muteClips)
          }
          className={PANEL_SELECT}
        >
          <option value="">None</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {tracks.length === 0 && (
          <a href={`/sites/${siteId}/media?purpose=music`} className="text-xs text-neutral-400 underline">
            Add music in the Media Catalogue
          </a>
        )}
      </div>
      {music && (
        <>
          <span>Volume</span>
          <label className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={music.volume}
              onChange={(e) => onChange({ ...music, volume: Number(e.target.value) }, muteClips)}
            />
            <span className="w-9 text-xs text-neutral-400">{Math.round(music.volume * 100)}%</span>
          </label>
        </>
      )}
      <span>Mute clip sound</span>
      <input
        type="checkbox"
        checked={muteClips}
        onChange={(e) => onChange(music, e.target.checked)}
        className="h-4 w-4 justify-self-start"
      />
      {track && (
        <>
          <span>Listen</span>
          <audio src={track.url} controls preload="none" className="h-8" />
        </>
      )}
    </div>
  );
}
