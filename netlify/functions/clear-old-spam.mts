import type { Config } from "@netlify/functions";
import { APP_URL } from "../../src/lib/appUrl";

// Daily (2026-10-20): deletes Inbox spam older than 30 days (see
// src/lib/spamFilter.ts). The work happens in the app (app/api/
// spam-cleanup), reached at its own address (APP_URL; see
// send-campaigns.mts).
export default async () => {
  try {
    const res = await fetch(`${APP_URL}/api/spam-cleanup`, { method: "POST", redirect: "manual" });
    const body = (await res.json().catch(() => null)) as { deleted?: number } | null;
    console.log(`[clear-old-spam] ${res.status}, deleted ${body?.deleted ?? "?"}`);
  } catch (err) {
    console.log("[clear-old-spam] failed:", err);
  }
};

export const config: Config = {
  schedule: "17 3 * * *",
};
