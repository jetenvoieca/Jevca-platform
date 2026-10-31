"use server";

import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { raiseAlertIfNotAlreadyOpen } from "@/lib/alerts";
import { artistFromAddress } from "@/lib/email";
import { isValidEmail, normalizeEmail } from "@/lib/emailAddress";
import { checkWebsiteVisitor } from "@/lib/turnstile";
import { subscribeFromWebsite } from "@/lib/websiteSubscribers";

// An enquiry about a work, sent from a website's Presentation window
// (2026-10-19, Craig's choices — see WorkEnquiryForm). It goes into the
// artist's Inbox as a message from the visitor, so it can be answered
// from there, and is also emailed to the artist's own address with the
// visitor as Reply-To. Ticking the mailing list box adds the visitor to
// the artist's Subscribers (no particular list).
//
// Called from the published page, so nothing sent from the browser is
// trusted beyond which site and work it is about and what was typed: the
// artist comes from the site, the work must be theirs, and the visitor
// must pass Cloudflare Turnstile's check on one of the site's own
// addresses (see checkWebsiteVisitor).

export type EnquiryResult = { ok: true } | { error: string };

const UNAVAILABLE = "Enquiries can't be sent right now — please try again later.";
const MAX_NAME = 100;
const MAX_MESSAGE = 5000;
// Same alert as an email arriving at the artist's address — it opens the Inbox.
const EMAIL_ALERT = "EMAIL_REPLY_RECEIVED";

export async function sendWebsiteEnquiry(input: {
  siteId: string;
  artworkId: string;
  name: string;
  email: string;
  message: string;
  joinMailingList: boolean;
  token: string;
}): Promise<EnquiryResult> {
  const name = String(input.name ?? "").trim();
  const email = normalizeEmail(String(input.email ?? ""));
  const message = String(input.message ?? "").trim();
  if (!name) return { error: "Please enter your name." };
  if (name.length > MAX_NAME) return { error: "Please shorten your name." };
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
  if (!message) return { error: "Please write a message." };
  if (message.length > MAX_MESSAGE) return { error: `Please keep the message under ${MAX_MESSAGE} characters.` };

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

  // The visitor may already be one of the artist's customers.
  const customer = await db.customer.findFirst({
    where: { artistId: artist.id, OR: [{ email }, { contactEmail: email }] },
    select: { id: true },
  });

  await db.inboundEmail.create({
    data: {
      fromAddress: email,
      fromName: name,
      toAddress: from.address,
      mailbox: "ART",
      artistId: artist.id,
      customerId: customer?.id ?? null,
      subject,
      textBody,
    },
  });
  await raiseAlertIfNotAlreadyOpen({
    artistId: artist.id,
    type: EMAIL_ALERT,
    severity: "WARNING",
    message: `New website enquiry about "${artwork.catalogueName}" — check the inbox.`,
  });
  revalidatePath("/accounts/dashboard");

  if (input.joinMailingList) {
    const [firstName, ...rest] = name.split(/\s+/);
    await subscribeFromWebsite(artist.id, email, { firstName, lastName: rest.join(" ") || null });
  }

  // The copy to the artist's own address. The enquiry is already in the
  // Inbox, so a failure here is only logged.
  const apiKey = process.env.RESEND_API_KEY;
  if (artist.email && apiKey) {
    const { error } = await new Resend(apiKey).emails.send({
      from: from.from,
      to: artist.email,
      replyTo: email,
      subject,
      text: textBody,
    });
    if (error) console.warn(`Website enquiry email to ${artist.name} failed: ${error.message}`);
  } else if (artist.email) {
    console.warn("Website enquiry not emailed — RESEND_API_KEY is missing.");
  }

  return { ok: true };
}
