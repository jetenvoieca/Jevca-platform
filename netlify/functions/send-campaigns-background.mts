import type { Config } from "@netlify/functions";

// Sends campaigns (2026-10-08) for up to about 14 minutes: asks the app
// to do one sending run after another (app/api/campaigns/send-due, about
// 8 seconds each) until nothing is left to send. Started every 5
// minutes by send-campaigns.mts, and straight away by Send now. A
// background function, so it can run far longer than a normal request;
// two at once are safe (each run takes its own batches).

const LIMIT_MS = 14 * 60 * 1000;
const MAX_FAILURES = 3;

export default async (request: Request) => {
  const base = process.env.URL;
  const secret = process.env.CAMPAIGN_SEND_SECRET;
  if (!base || !secret || request.headers.get("x-campaign-send-secret") !== secret) return;

  const until = Date.now() + LIMIT_MS;
  let failures = 0;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${base}/api/campaigns/send-due`, {
        method: "POST",
        headers: { "x-campaign-send-secret": secret },
      });
      const body = (await res.json()) as { more?: boolean; error?: string };
      if (body.error) console.log("[send-campaigns-background]", body.error);
      if (!res.ok || body.error) failures++;
      else failures = 0;
      if (!body.more || failures >= MAX_FAILURES) break;
      // After a failed run (e.g. Resend's rate limit), wait a little.
      if (failures > 0) await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (err) {
      console.log("[send-campaigns-background] run failed:", err);
      if (++failures >= MAX_FAILURES) break;
    }
  }
};

export const config: Config = {
  background: true,
};
