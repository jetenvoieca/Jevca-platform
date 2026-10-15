// Shared by the app and the background function that copies a Hopper
// CSV import's videos (netlify/functions/import-hopper-video-background.mts)
// — kept free of database code so the function stays small. See
// lib/hopperVideoImport.ts.

export const MEDIA_IMPORT_SECRET_HEADER = "x-media-import-secret";

// What the background function is sent to copy one video.
export type VideoCopyRequest = {
  importId: string;
  sourceUrl: string;
  key: string;
  contentType: string;
};

// What it reports back to /api/hopper/video-import when done.
export type VideoCopyReport = { importId: string } & ({ ok: true } | { ok: false; error: string });
