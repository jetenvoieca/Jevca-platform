import { NextResponse, type NextRequest } from "next/server";
import { runCampaignSending } from "@/lib/campaignSending";

// One campaign sending run (2026-10-08) — called over and over by the
// background function netlify/functions/send-campaigns-background.mts
// while there's sending to do. Works for about 8 seconds (inside the
// time a request here is allowed), then says whether there's more.
// Only callers with CAMPAIGN_SEND_SECRET get in (this route is outside
// the login, see middleware.ts).

export const dynamic = "force-dynamic";

const BUDGET_MS = 8000;

export async function POST(request: NextRequest) {
  const secret = process.env.CAMPAIGN_SEND_SECRET;
  if (!secret || request.headers.get("x-campaign-send-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runCampaignSending(BUDGET_MS);
  return NextResponse.json(result);
}
