"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/emailAddress";
import type { SignupResult } from "@/lib/signupForms";
import { adminDomain, cleanDomain, hostIsWithin, verifyTurnstile } from "@/lib/turnstile";

// A visitor signing up with a website's sign-up form (2026-10-10,
// Marketing step 5) — see lib/signupForms.ts. Called from the published
// page, so nothing sent from the browser is trusted beyond which form it
// was and the address typed: the list comes from the form's set-up, the
// artist from the page's site, and the visitor must pass Cloudflare
// Turnstile's check on a host that belongs to that site (its domain, or
// the admin's own address, where sites are previewed).
//
// Craig's choices: email only, subscribed straight away (no
// confirmation mail), someone who unsubscribed earlier is subscribed
// again. A bounced or spam-marked address keeps that status (set back
// by hand on the Subscribers page) but still joins the list.
// Saved with no language, so the artist's default applies.

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

  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().split(":")[0];
  const siteDomain = site.domain ? cleanDomain(site.domain) : null;
  if (host !== adminDomain() && !(siteDomain && hostIsWithin(host, siteDomain))) {
    return { error: UNAVAILABLE };
  }
  const ip = h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await verifyTurnstile(host, String(input.token ?? ""), ip))) {
    return { error: "We couldn't check you're not a robot — please try again." };
  }

  const now = new Date();
  const subscriber = await db.subscriber.upsert({
    where: { artistId_email: { artistId: site.artistId, email } },
    create: { artistId: site.artistId, email, source: "WEBSITE", consentAt: now },
    update: {},
    select: { id: true },
  });
  await db.subscriber.updateMany({
    where: { id: subscriber.id, status: "UNSUBSCRIBED" },
    data: { status: "SUBSCRIBED", unsubscribedAt: null, consentAt: now },
  });
  if (form.listId) {
    await db.mailListMember.createMany({
      data: [{ listId: form.listId, subscriberId: subscriber.id }],
      skipDuplicates: true,
    });
  }
  return { ok: true };
}
