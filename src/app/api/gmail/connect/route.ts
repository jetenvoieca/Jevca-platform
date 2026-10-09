import { NextRequest, NextResponse } from "next/server";
import { gmailAuthorizeUrl, GMAIL_COOKIE_PATH, GMAIL_STATE_COOKIE } from "@/lib/gmail";

// "Connect Gmail" in the Inbox's Personal tab (2026-10-09) — sends the
// browser to Google to sign in and approve, with a one-off nonce Google
// must hand back unchanged (see the callback). Behind the admin login.
export async function GET(request: NextRequest) {
  const nonce = crypto.randomUUID();
  let url: string;
  try {
    url = gmailAuthorizeUrl(nonce);
  } catch (err) {
    const back = new URL("/accounts/inbox", request.url);
    back.searchParams.set("personal", "1");
    back.searchParams.set("gmailError", err instanceof Error ? err.message : "Couldn't start the Gmail connection.");
    return NextResponse.redirect(back);
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(GMAIL_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: GMAIL_COOKIE_PATH,
    maxAge: 15 * 60,
  });
  return response;
}
