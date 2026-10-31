"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/emailAddress";
import { checkWebsiteVisitor } from "@/lib/turnstile";
import { BUSINESS_WEBSITE_DOMAIN, CONTACT_MAX_MESSAGE, CONTACT_MAX_NAME } from "@/lib/businessWebsite";
import { spamVerdict } from "@/lib/spamFilter";

// The contact form on the business website's Home page (2026-10-20,
// direct request — the address shown there drew spam, so it's no longer
// shown anywhere on the site). A message goes into the Inbox's Business
// mailbox as if emailed to the Home page's address (WebsiteHome.email),
// so it's answered from there, and passes the same spam filter as email
// (lib/spamFilter.ts).
//
// Sent from the public page, so only what was typed is taken from the
// browser: the address it goes to is read here, and the visitor must
// pass Cloudflare Turnstile's check on the website's own address.

export type ContactResult = { ok: true } | { error: string };

const UNAVAILABLE = "Messages can't be sent right now — please try again later.";

export async function sendBusinessContact(input: {
  name: string;
  email: string;
  message: string;
  token: string;
}): Promise<ContactResult> {
  const name = String(input.name ?? "").trim();
  const email = normalizeEmail(String(input.email ?? ""));
  const message = String(input.message ?? "").trim();
  if (!name) return { error: "Please enter your name." };
  if (name.length > CONTACT_MAX_NAME) return { error: "Please shorten your name." };
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
  if (!message) return { error: "Please write a message." };
  if (message.length > CONTACT_MAX_MESSAGE) {
    return { error: `Please keep the message under ${CONTACT_MAX_MESSAGE} characters.` };
  }

  const home = await db.websiteHome.findUnique({ where: { id: "singleton" }, select: { email: true } });
  if (!home?.email) return { error: UNAVAILABLE };

  const visitor = await checkWebsiteVisitor(BUSINESS_WEBSITE_DOMAIN, String(input.token ?? ""));
  if (visitor === "elsewhere") return { error: UNAVAILABLE };
  if (visitor === "robot") return { error: "We couldn't check you're not a robot — please try again." };

  const subject = `Website message from ${name}`;
  const textBody = [message, "", "—", `${name} <${email}>`, `Sent from the contact form on ${BUSINESS_WEBSITE_DOMAIN}.`].join(
    "\n"
  );

  // As for email to the business: matched to the client artist who sent
  // it, if any, and spam-checked the same way (a client artist is known).
  const artist = await db.artist.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  const verdict = await spamVerdict(
    { fromAddress: email, fromName: name, toAddress: home.email, subject, text: message },
    artist !== null
  );

  await db.inboundEmail.create({
    data: {
      fromAddress: email,
      fromName: name,
      toAddress: home.email,
      mailbox: "BUSINESS",
      artistId: artist?.id ?? null,
      subject,
      textBody,
      ...(verdict.spam ? { spamAt: new Date(), spamReason: verdict.reason } : {}),
    },
  });
  revalidatePath("/accounts/dashboard");
  return { ok: true };
}
