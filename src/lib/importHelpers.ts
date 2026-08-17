// Deliberately NOT a "use server" file — artworkImport.ts has that
// directive, which requires every export to be an async function
// (Next.js Server Actions rule). This is a plain synchronous string
// transform, so it lives here instead and gets imported by both
// artworkImport.ts and hopperImport.ts, so there's one source of truth
// rather than two copies drifting apart. Same reasoning as
// artworkFilters.ts existing separately from artworks.ts.
//
// Bug this fixes (2026-08-17): exporting this directly from
// artworkImport.ts broke the Netlify build — "Server Actions must be
// async functions" — the moment it was exported for hopperImport.ts to
// reuse. Caught by the deploy log, not by anything checkable without a
// real Next.js/Turbopack build (esbuild and tsc alone don't know about
// this Next.js-specific rule).

// Confirmed 2026-08-11, from the actual data — not a bot-blocking or
// network issue as first (wrongly) assumed: 58 of that export's 100
// Image URL values were two complete URLs concatenated with no
// separator, e.g. "https://louisedear.comhttps://pub-xxxx.r2.dev/...".
// A bug in the old site's own export, not anything server-side here.
// Every single one of the 58 followed this exact shape (verified — no
// partial/different variants), so this is a safe, complete repair
// rather than a guess at a fix.
export function repairDoubledUrl(raw: string): string {
  const match = raw.match(/^https?:\/\/[^/]+(https?:\/\/.+)$/);
  return match ? match[1] : raw;
}
