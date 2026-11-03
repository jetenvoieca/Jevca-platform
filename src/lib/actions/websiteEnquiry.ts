"use server";

import { db } from "@/lib/db";
import { artistFromAddress } from "@/lib/email";
import { checkWebsiteVisitor } from "@/lib/turnstile";
import { deliverWebsiteMessage, readWebsiteMessage } from "@/lib/websiteMessages";

// An enquiry about a work, sent from a website's Presentation window
// (2026-10-19, Craig's choices — see WorkEnquiryForm). Delivered like
// every website message (lib/websiteMessages.ts): into the artist's
// Inbox, emailed to their own address, and the visitor added to their
// Subscribers if they ticked the mailing list box.
//
// Called from the published page, so nothing sent from the browser is
// trusted beyond which site and work it is about and what was typed: the
// artist comes from the site, the work must be theirs, and the visitor
// must pass Cloudflare Turnstile's check on one of the site's own
// addresses (see checkWebsiteVisitor).

export type EnquiryResult = { ok: true } | { error: string };

const UNAVAILABLE = "Enquiries can't be sent right now — please try again later.";

export async function sendWebsiteEnquiry(input: {
  siteId: string;
  artworkId: string;
  name: string;
  email: string;
  message: string;
  joinMailingList: boolean;
  token: string;
}): Promise<EnquiryResult> {
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
  const artwork = await db.artwork.findFirst({
    where: { id: String(input.artworkId), artistId: artist.id },
    select: { catalogueName: true },
  });
  if (!artwork) return { error: UNAVAILABLE };
  const from = artistFromAddress(artist);
  if (!from.ok) return { error: UNAVAILABLE };

  const visitor = await checkWebsiteVisitor(site.domain, String(input.token ?? ""));
  if (visitor === "elsewhere") return { error: UNAVAILABLE };
  if (visitor === "robot") return { error: "We couldn't check you're not a robot — please try again." };

  const subject = `Enquiry: ${artwork.catalogueName}`;
  const where = site.domain ? ` on ${site.domain}` : "";
  const textBody = [
    message,
    "",
    "—",
    `${name} <${email}>`,
    `Sent from the enquiry form${where} about "${artwork.catalogueName}".`,
    ...(input.joinMailingList ? ["They joined the mailing list."] : []),
  ].join("\n");

  await deliverWebsiteMessage({
    artist,
    from,
    name,
    email,
    subject,
    textBody,
    alert: `New website enquiry about "${artwork.catalogueName}" — check the inbox.`,
    joinMailingList: input.joinMailingList,
  });
  return { ok: true };
}
