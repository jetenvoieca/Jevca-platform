import type { Config } from "@netlify/functions";
import { APP_URL } from "../../src/lib/appUrl";

// Every 10 minutes (2026-10-19): releases works held for website buyers
// who didn't finish paying (see src/lib/paymentHolds.ts). The work
// happens in the app (app/api/payment-holds), reached at its own address
// (APP_URL; see send-campaigns.mts).
export default async () => {
  try {
    const res = await fetch(`${APP_URL}/api/payment-holds`, { method: "POST", redirect: "manual" });
    const body = (await res.json().catch(() => null)) as { released?: number } | null;
    console.log(`[release-payment-holds] ${res.status}, released ${body?.released ?? "?"}`);
  } catch (err) {
    console.log("[release-payment-holds] failed:", err);
  }
};

export const config: Config = {
  schedule: "*/10 * * * *",
};
