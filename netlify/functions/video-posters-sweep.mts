import type { Config } from "@netlify/functions";
import { APP_URL } from "../../src/lib/appUrl";
import { MEDIA_JOB_SECRET_HEADER } from "../../src/lib/mediaJobs";

// Once an hour (2026-10-16): starts the background function that makes
// still pictures for any videos still without one — the first run does
// all the older videos, later runs catch any a video's arrival didn't
// (see src/lib/videoPosters.ts).
export default async () => {
  const secret = process.env.MEDIA_IMPORT_SECRET;
  if (!secret) {
    console.log("[video-posters-sweep] MEDIA_IMPORT_SECRET missing");
    return;
  }
  try {
    const res = await fetch(`${APP_URL}/.netlify/functions/make-video-posters-background`, {
      method: "POST",
      headers: { [MEDIA_JOB_SECRET_HEADER]: secret },
      redirect: "manual",
    });
    console.log(`[video-posters-sweep] ${res.status}`);
  } catch (err) {
    console.log("[video-posters-sweep] failed:", err);
  }
};

export const config: Config = {
  // 23 minutes past each hour.
  schedule: "23 * * * *",
};
