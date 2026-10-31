// How the admin names one of a client's sites (2026-10-31, Craig's
// request — a client can have several): "Owner · Site name". Used by the
// menu's recent sites and the Hopper alerts. A plain module, so client
// components can use it too.
export function siteLabel(ownerName: string, siteName: string): string {
  return `${ownerName} · ${siteName}`;
}
