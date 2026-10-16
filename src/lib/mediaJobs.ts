// Shared by the app and the Netlify background functions that work on
// media (2026-10-16): copying a Hopper CSV import's videos and making
// videos' still pictures. Kept free of database code so the functions
// stay small. Both are protected by MEDIA_IMPORT_SECRET (a Netlify
// environment variable), sent in this header.

export const MEDIA_JOB_SECRET_HEADER = "x-media-import-secret";

// A video that needs a still picture, as handed to the background function.
export type VideoPosterJob = { id: string; key: string };

// What it reports back to /api/video-posters for one video.
export type VideoPosterReport = { id: string } & ({ ok: true; posterKey: string } | { ok: false; error: string });
