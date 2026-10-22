// Where a published site switches between its phone and desktop layouts
// (2026-10-22, Craig's choice: 700px for every site, as louisedear.com
// does). Narrower than SITE_DESKTOP_MIN is a phone. The same number is
// Tailwind's `site:` breakpoint (tailwind.config.ts), used by everything
// drawn on a site's pages; scripts that need it use SITE_PHONE_QUERY.
export const SITE_DESKTOP_MIN = 700;

export const SITE_PHONE_QUERY = `(max-width: ${SITE_DESKTOP_MIN - 1}px)`;
