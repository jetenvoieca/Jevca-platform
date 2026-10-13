import type { Config } from "@netlify/functions";
import { APP_URL } from "../../src/lib/appUrl";

// Every 5 minutes (2026-10-08): wakes the campaign sending runs, so a
// campaign set to send at a time goes within 5 minutes of it (Craig's
// choice), and anything a run left unfinished carries on. The work
// itself happens in send-campaigns-background.mts, which can run for
// up to 15 minutes. It's reached at the app's own address (APP_URL),
// not Netlify's URL: that is the site's main domain, www.jetenvoieca.com,
// the business website, where the app's routes are a 404.
export default async () => {
  const secret = process.env.CAMPAIGN_SEND_SECRET;
  if (!secret) {
    console.log("[send-campaigns] CAMPAIGN_SEND_SECRET missing");
    return;
  }
  try {
    const res = await fetch(`${APP_URL}/.netlify/functions/send-campaigns-background`, {
      method: "POST",
      headers: { "x-campaign-send-secret": secret },
      // A redirect means it never reached the function — don't follow it.
      redirect: "manual",
    });
    // A background function answers 202 once it has started.
    console.log(
      res.status === 202
        ? "[send-campaigns] woke the sender"
        : `[send-campaigns] could not wake the sender: ${res.status}`
    );
  } catch (err) {
    console.log("[send-campaigns] could not wake the sender:", err);
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
