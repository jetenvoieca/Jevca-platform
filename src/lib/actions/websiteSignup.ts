"use server";

import { db } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/emailAddress";
import type { SignupResult } from "@/lib/signupForms";
import { checkWebsiteVisitor } from "@/lib/turnstile";
import { subscribeFromWebsite } from "@/lib/websiteSubscribers";

// A visitor signing up with a website's sign-up form (2026-10-10,
// Marketing step 5) — see lib/signupForms.ts. Called from the published
// page, so nothing sent from the browser is trusted beyond which form it
// was and the address typed: the list comes from the form's set-up, the
// artist from the page's site, and the visitor must pass Cloudflare
// Turnstile's check on a host that belongs to that site (see
// checkWebsiteVisitor). Craig's choices: email only; how a subscriber is
// added is in lib/websiteSubscribers.ts.

const UNAVAILABLE = "Sign-up isn't available right now — please try again later.";

export async function signUpFromWebsite(input: {
  siteId: string;
  pageId: string;
  blockId: string;
  email: string;
  token: string;
}): Promise<SignupResult> {
  const email = normalizeEmail(String(input.email ?? ""));
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };

  const form = await db.pageSignupForm.findFirst({
    where: { pageId: String(input.pageId), blockId: String(input.blockId), page: { siteId: String(input.siteId) } },
    select: { listId: true, page: { select: { site: { select: { artistId: true, domain: true } } } } },
  });
  if (!form) return { error: UNAVAILABLE };
  const site = form.page.site;

  const visitor = await checkWebsiteVisitor(site.domain, String(input.token ?? ""));
  if (visitor === "elsewhere") return { error: UNAVAILABLE };
  if (visitor === "robot") return { error: "We couldn't check you're not a robot — please try again." };

  const subscriberId = await subscribeFromWebsite(site.artistId, email);
  if (form.listId) {
    await db.mailListMember.createMany({
      data: [{ listId: form.listId, subscriberId }],
      skipDuplicates: true,
    });
  }
  return { ok: true };
}
