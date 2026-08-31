// Shown automatically by Next.js while a page (and the server data it
// needs) is loading — e.g. navigating from the Sites Directory into a
// site, or any other top-level navigation that has to wait on the
// database. Added 2026-08-31: this app had no loading.tsx anywhere,
// which meant navigation showed nothing at all in the meantime — no
// spinner, no visual change of any kind — until the new page was fully
// ready. That's indistinguishable from the app being stuck, which is
// exactly the "moving around the studio feels sluggish, can't tell if
// it's doing anything" report this addresses. This doesn't make any
// fetch faster on its own (see the separate caching work in
// lib/alerts.ts and lib/actions/*.ts for that) — it just gives an
// immediate, honest "something is happening" signal for whatever time
// is left.
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600"
          aria-hidden="true"
        />
        Loading…
      </div>
    </div>
  );
}
