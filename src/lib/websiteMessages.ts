import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { raiseAlertIfNotAlreadyOpen } from "@/lib/alerts";
import { subscribeFromWebsite } from "@/lib/websiteSubscribers";
import { isValidEmail, normalizeEmail } from "@/lib/emailAddress";

// A message a visitor sends from a website (2026-11-03 — shared by the
// work enquiry form, lib/actions/websiteEnquiry.ts, and the Contact
// panel, lib/actions/websiteContact.ts). Plain server code, not "use
// server": the actions check the site, the visitor and what was typed
// first. The message goes into the artist's Inbox as from the visitor, so
// it can be answered from there, with the Inbox's alert raised, and is
// emailed to the artist's own address with the visitor as Reply-To.
// Ticking the mailing list box adds the visitor to the artist's
// Subscribers (no particular list).

const MAX_NAME = 100;
const MAX_MESSAGE = 5000;

// What the visitor typed, tidied and checked — or what to put right.
export function readWebsiteMessage(input: {
  name: unknown;
  email: unknown;
  message: unknown;
}): { name: string; email: string; message: string } | { error: string } {
  const name = String(input.name ?? "").trim();
  const email = normalizeEmail(String(input.email ?? ""));
  const message = String(input.message ?? "").trim();
  if (!name) return { error: "Please enter your name." };
  if (name.length > MAX_NAME) return { error: "Please shorten your name." };
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
  if (!message) return { error: "Please write a message." };
  if (message.length > MAX_MESSAGE) return { error: `Please keep the message under ${MAX_MESSAGE} characters.` };
  return { name, email, message };
}

// Same alert as an email arriving at the artist's address — it opens the Inbox.
const EMAIL_ALERT = "EMAIL_REPLY_RECEIVED";

export async function deliverWebsiteMessage(input: {
  artist: { id: string; name: string; email: string | null };
  // The artist's @jevca.art address and "from" line (artistFromAddress).
  from: { address: string; from: string };
  name: string;
  email: string;
  subject: string;
  textBody: string;
  alert: string;
  joinMailingList: boolean;
}): Promise<void> {
  const { artist, from, name, email, subject, textBody } = input;

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
    message: input.alert,
  });
  revalidatePath("/accounts/dashboard");

  if (input.joinMailingList) {
    const [firstName, ...rest] = name.split(/\s+/);
    await subscribeFromWebsite(artist.id, email, { firstName, lastName: rest.join(" ") || null });
  }

  // The copy to the artist's own address. The message is already in the
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
    if (error) console.warn(`Website message email to ${artist.name} failed: ${error.message}`);
  } else if (artist.email) {
    console.warn("Website message not emailed — RESEND_API_KEY is missing.");
  }
}
