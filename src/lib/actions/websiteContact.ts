"use server";

import { db } from "@/lib/db";
import { artistFromAddress } from "@/lib/email";
import { checkWebsiteVisitor } from "@/lib/turnstile";
import { deliverWebsiteMessage, readWebsiteMessage } from "@/lib/websiteMessages";

// A message sent from a website's Contact panel (2026-11-03, Craig's
// request — the ISYT contact pages; see ContactPanel). Delivered like
// every website message (lib/websiteMessages.ts): into the artist's
// Inbox, emailed to their own address, and the visitor added to their
// Subscribers if they ticked the mailing list box.
//
// Called from the published page, so nothing sent from the browser is
// trusted beyond which site it is and what was typed: the artist comes
// from the site, and the visitor must pass Cloudflare Turnstile's check
// on one of the site's own addresses (see checkWebsiteVisitor).

export type ContactResult = { ok: true } | { error: string };

const UNAVAILABLE = "Messages can't be sent right now — please try again later.";

export async function sendWebsiteContact(input: {
  siteId: string;
  name: string;
  email: string;
  message: string;
  joinMailingList: boolean;
  token: string;
}): Promise<ContactResult> {
  const typed = readWebsiteMessage(input);
  if ("error" in typed) return typed;
  const { name, email, message } = typed;

  const site = await db.site.findUnique({
    where: { id: String(input.siteId) },
    select: {
      domain: true,
      artist: { select: { id: true, name: true, email: true, emailSlug: true } },
    },
  });
  if (!site) return { error: UNAVAILABLE };
  const { artist } = site;
  const from = artistFromAddress(artist);
  if (!from.ok) return { error: UNAVAILABLE };

  const visitor = await checkWebsiteVisitor(site.domain, String(input.token ?? ""));
  if (visitor === "elsewhere") return { error: UNAVAILABLE };
  if (visitor === "robot") return { error: "We couldn't check you're not a robot — please try again." };

  const joinMailingList = input.joinMailingList === true;
  const where = site.domain ? ` on ${site.domain}` : "";
  const textBody = [
    message,
    "",
    "—",
    `${name} <${email}>`,
    `Sent from the contact form${where}.`,
    ...(joinMailingList ? ["They joined the mailing list."] : []),
  ].join("\n");

  await deliverWebsiteMessage({
    artist,
    from,
    name,
    email,
    subject: `Website message from ${name}`,
    textBody,
    alert: `New message from your website's contact form — check the inbox.`,
    joinMailingList,
  });
  return { ok: true };
}
