import { NextResponse, type NextRequest } from "next/server";
import { TEST_UNSUBSCRIBE_TOKEN, unsubscribeByToken, unsubscribePageUrl } from "@/lib/unsubscribe";

// One-click unsubscribe (2026-10-08, RFC 8058): the email app's own
// Unsubscribe button POSTs here, from the List-Unsubscribe headers on
// every campaign mail. Opened in a browser instead, it goes to the
// unsubscribe page, which asks to confirm.

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token !== TEST_UNSUBSCRIBE_TOKEN) await unsubscribeByToken(token);
  return new NextResponse(null, { status: 200 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(unsubscribePageUrl(token), 303);
}
