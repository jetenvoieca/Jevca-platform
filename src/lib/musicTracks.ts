// The Music library (2026-10-16) — shared by the Media Catalogue's Music
// view, Video Edit and the server. Plain module.

// The audio files taken: MP3, M4A/AAC and WAV — what Shotstack plays as a
// soundtrack.
export const MUSIC_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav"];

export const MUSIC_ACCEPT = ".mp3,.m4a,.aac,.wav,audio/mpeg,audio/mp4,audio/aac,audio/wav";

export type MusicTrackRow = {
  id: string;
  name: string;
  // Where the browser plays it.
  url: string;
  durationSeconds: number | null;
};
