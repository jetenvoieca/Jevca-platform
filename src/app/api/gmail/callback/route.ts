import { NextRequest, NextResponse } from "next/server";
import { isValidSignedState } from "@/lib/auth";
import { completeGmailConnection, GMAIL_STATE_PURPOSE } from "@/lib/gmail";

// Where Google returns after Connect Gmail is approved (or cancelled).
// Checks the signed `state` the connect route sent (so only a sign-in
// this app started, in the last few minutes, is accepted — and this route
// is behind the admin login too), saves the connection, and goes back to
// the Inbox's Personal tab either way, with a message if it didn't work.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const back = (error: string | null) => {
    const url = new URL("/accounts/inbox", request.url);
    url.searchParams.set("personal", "1");
    if (error) url.searchParams.set("gmailError", error);
    return NextResponse.redirect(url);
  };

  if (!(await isValidSignedState(GMAIL_STATE_PURPOSE, params.get("state")))) {
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
