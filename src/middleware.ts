import { NextRequest, NextResponse } from "next/server";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Paths that authenticate themselves separately and must stay reachable
// without the app's shared password:
// - /api/hopper/*        — the iPhone Shortcut, authenticated by its own
//   per-artist hopperToken (see hopper-design.md)
// - /api/stripe/webhook  — authenticated by Stripe's own signature check
// - /login               — has to be reachable before you're logged in
const PUBLIC_PATH_PREFIXES = ["/api/hopper", "/api/stripe/webhook", "/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await isValidSessionToken(token);

  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own static/image assets — those carry
  // nothing sensitive and gating them just adds needless redirects.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
