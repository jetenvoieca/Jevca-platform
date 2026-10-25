# Jevca Hopper Importer

Kept in the Jevca-platform repo (`extension/`, since 2026-10-25) so it's
versioned with the app endpoints it calls (`/api/extension/artists`,
`/api/hopper/request-upload`, `/api/hopper/finalize`).

Works on any website: adds checkboxes to the images on whatever page you're
looking at, then sends the ones you pick straight into the chosen artist's
real Hopper on the Jevca platform — no dragging, no opening tabs, no manual
tokens to paste.

## Install it (one-time, ~1 minute)

1. Download this `extension` folder from the repo and keep it somewhere (don't delete it afterwards —
   Chrome keeps loading the extension from this folder).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**, and select this folder.
5. You should see "Jevca Hopper Importer" appear in your extensions list.
   Pin it (click the puzzle-piece icon in your toolbar, then the pin next to
   the extension) so it's always visible.

Chrome will show a permission warning along the lines of "read and change
all your data on all websites". That's expected — it's what lets the
extension download images regardless of which site or CDN they're hosted
on. It only acts when you click "Activate on this page"; it doesn't run in
the background on sites you haven't asked it to.

## Load the artist list (do this once, and any time artists change)

1. Open the Jevca dashboard in a tab, logged in as normal.
2. Click the extension's icon, then **Refresh artist list**.
3. This reads every artist's name straight from Jevca (using that open
   tab's own login), so from then on you just pick a name from the
   dropdown — no tokens to find or paste in.

If you ever see "No Jevca admin tab is open", it just means Refresh
couldn't find a Jevca tab to read from — open one and try again.

## Use it

1. Go to any page with images you want to import (a supplier's site, a
   folder of photos, wherever). If the site paginates its results
   (`?page=2`, `?page=3`...), it doesn't matter which page you're on when
   you start.
2. Click the extension's icon, choose the **artist** you're importing for,
   then **Activate on this page**.
3. A picker panel opens over the page. It briefly says "Scanning page 1 of
   N…" — this is it automatically checking for and pulling in every other
   page of results, so you only ever have to do this once per site rather
   than once per page.
4. Once scanning finishes, you'll see a grid of thumbnails from every page
   combined. Where the extension found a name or description on the source
   page for an image (alt text, a caption, a product name/description near
   it), that's shown as the card's label — hover the small "i" badge on a
   card to see both in full. It's a best-effort prefill only; nothing is
   final until you sort it in the Hopper.
5. Tick the ones you want (or click **Select all**), then **Send to
   Hopper**. Each card gets a green or red border as it succeeds or fails,
   and progress shows at the top.
6. When it says "All done!", open that artist's Hopper in Jevca — the new
   images will be sitting there with status HOPPER, ready to sort, same as
   anything sent from the iPhone Shortcut.
7. Click the **✕** in the panel, or click "Activate on this page" again, to
   close it.

## If it stops finding images, or the send fails

- **The picker grid is empty, or missing images**: some sites load their
  real image behind a smaller placeholder, or use background-images instead
  of `<img>` tags, which this can't currently detect. Open `content.js` and
  look at `getFullResUrl` / `MIN_SIZE` if you need to adjust the detection
  for a particular site.
- **The count looks too high**: some themes render the same photo more than
  once in the page markup (a hover-swap image, a hidden quick-view
  duplicate). The picker tries to collapse these by stripping size-variant
  suffixes from the filename before comparing — if a site's naming pattern
  doesn't match that, duplicates can still slip through. They're harmless
  to just leave unticked.
- **Only some pages get scanned**: pagination detection relies on finding
  `?page=2`, `?page=3` etc. links somewhere on the page, or crawling
  forward from the highest one it finds. Sites using a "Load more" button
  or infinite scroll instead of numbered pages aren't covered by this yet.
- **After any update to the extension**: always click the reload icon (⟳)
  on its card at `chrome://extensions`, then close and reopen the tab
  you're testing on. Chrome doesn't pick up file changes automatically.
  The bottom-right corner of the picker panel always shows the extension's
  version number.
- **An image fails to send**: check the error shown next to that file for
  details — usually the image's URL couldn't be reached directly, or the
  selected artist's token is out of date (regenerate it in Jevca's Site
  Settings, then Refresh artist list).
- **"No Jevca admin tab is open"**: open the Jevca dashboard in a tab
  (any page on it), then click Refresh again.

## Notes

- Images are sent one at a time, with a short pause between each.
- Nothing is uploaded until you click **Send to Hopper** — ticking
  checkboxes just marks your selection.
- Every artist's token lives only in your browser's local extension
  storage, refreshed from Jevca on demand — nothing is hardcoded per artist.
