import type { Config } from "@netlify/functions";

// Keeps the app's server function and the Neon database compute both
// warm, so real clicks don't pay the ~3s (server) + ~1.5s (database)
// cold-start costs found and confirmed 2026-08-12. Runs every 5 minutes,
// which is comfortably inside both Netlify's and Neon's idle-suspend
// windows. See src/app/api/keepalive/route.ts for what actually happens
// on each ping.
export default async () => {
  try {
    const res = await fetch("https://jevca.netlify.app/api/keepalive");
    console.log(`[keep-warm] ping status ${res.status}`);
  } catch (err) {
    console.log("[keep-warm] ping failed:", err);
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
