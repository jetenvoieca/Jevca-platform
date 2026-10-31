import type { Metadata } from "next";

// Saved to the iPad's Home Screen, the Dashboard and Inbox open as their
// own app, "JEVCAStudio" (2026-10-09, direct request) — full screen,
// starting on the Dashboard (2026-10-31). The manifest and icons are in
// public/inbox-app/. Only these two pages link them, so the artists'
// Studio app keeps its own.
export const studioAppMetadata: Metadata = {
  manifest: "/inbox-app/manifest.webmanifest",
  icons: { apple: "/inbox-app/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "JEVCAStudio", statusBarStyle: "default" },
};
