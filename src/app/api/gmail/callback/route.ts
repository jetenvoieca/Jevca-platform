import { NextRequest, NextResponse } from "next/server";
import { completeGmailConnection, GMAIL_COOKIE_PATH, GMAIL_STATE_COOKIE } from "@/lib/gmail";

// Where Google returns after Connect Gmail is approved (or cancelled).
// Checks the nonce, saves the connection, and goes back to the Inbox's
// Personal tab either way, with a message if it didn't work.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const nonce = request.cookies.get(GMAIL_STATE_COOKIE)?.value;

  const back = (error: string | null) => {
    const url = new URL("/accounts/inbox", request.url);
    url.searchParams.set("personal", "1");
    if (error) url.searchParams.set("gmailError", error);
    const response = NextResponse.redirect(url);
    response.cookies.set(GMAIL_STATE_COOKIE, "", { path: GMAIL_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  if (!nonce || params.get("state") !== nonce) {
    return back("The Gmail connection couldn't be verified. Please try again.");
  }
  if (params.get("error")) return back("The Gmail connection was cancelled.");
  const code = params.get("code");
  if (!code) return back("Google didn't return a connection code.");

  try {
    await completeGmailConnection(code);
  } catch (err) {
    return back(err instanceof Error ? err.message : "Couldn't connect Gmail.");
  }
  return back(null);
}
