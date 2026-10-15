import type { Config } from "@netlify/functions";
import { APP_URL } from "../../src/lib/appUrl";

// Once a day (2026-10-15): renews artists' Instagram connections before
// they run out — see src/lib/instagramRenewal.ts. Reached at the app's
// own address (APP_URL), like send-campaigns.mts.
export default async () => {
  const secret = process.env.INSTAGRAM_RENEW_SECRET;
  if (!secret) {
    console.log("[renew-instagram] INSTAGRAM_RENEW_SECRET missing");
    return;
  }
  try {
    const res = await fetch(`${APP_URL}/api/instagram/renew`, {
      method: "POST",
      headers: { "x-instagram-renew-secret": secret },
      // A redirect means it never reached the route — don't follow it.
      redirect: "manual",
    });
    console.log(`[renew-instagram] ${res.status} ${await res.text()}`);
  } catch (err) {
    console.log("[renew-instagram] failed:", err);
  }
};

export const config: Config = {
  // 04:17 UTC — a quiet time, off the hour.
  schedule: "17 4 * * *",
};
