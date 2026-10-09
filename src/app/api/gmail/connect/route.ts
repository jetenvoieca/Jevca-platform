import { NextRequest, NextResponse } from "next/server";
import { createSignedState } from "@/lib/auth";
import { gmailAuthorizeUrl, GMAIL_STATE_LIFETIME_MS, GMAIL_STATE_PURPOSE } from "@/lib/gmail";

// "Connect Gmail" in the Inbox's Personal tab (2026-10-09) — sends the
// browser to Google to sign in and approve, with a signed `state` Google
// must hand back unchanged (see the callback). Behind the admin login.
export async function GET(request: NextRequest) {
  try {
    const state = await createSignedState(GMAIL_STATE_PURPOSE, GMAIL_STATE_LIFETIME_MS);
    return NextResponse.redirect(gmailAuthorizeUrl(state));
  } catch (err) {
    const back = new URL("/accounts/inbox", request.url);
    back.searchParams.set("personal", "1");
    back.searchParams.set("gmailError", err instanceof Error ? err.message : "Couldn't start the Gmail connection.");
    return NextResponse.redirect(back);
  }
}
