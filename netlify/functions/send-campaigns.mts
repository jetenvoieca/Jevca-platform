import type { Config } from "@netlify/functions";

// Every 5 minutes (2026-10-08): wakes the campaign sending runs, so a
// campaign set to send at a time goes within 5 minutes of it (Craig's
// choice), and anything a run left unfinished carries on. The work
// itself happens in send-campaigns-background.mts, which can run for
// up to 15 minutes.
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CAMPAIGN_SEND_SECRET;
  if (!base || !secret) {
    console.log("[send-campaigns] URL or CAMPAIGN_SEND_SECRET missing");
    return;
  }
  try {
    const res = await fetch(`${base}/.netlify/functions/send-campaigns-background`, {
      method: "POST",
      headers: { "x-campaign-send-secret": secret },
    });
    console.log(`[send-campaigns] woke the sender: ${res.status}`);
  } catch (err) {
    console.log("[send-campaigns] could not wake the sender:", err);
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
