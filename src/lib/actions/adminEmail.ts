"use server";

import { db } from "@/lib/db";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";

// Ad hoc admin emails (2026-09-05, Email Integration) — the Inbox's
// "New message" compose flow. Always sent from one shared admin address
// (PlatformSettings.adminEmailAddress, defaulting to craig@jevca.art),
// never on an artist's behalf regardless of who the recipient is —
// direct decision: "craig@jevca.art is more friendly".

const SINGLETON_ID = "singleton";

export type ComposeRecipient = {
  label: string;
  email: string;
  artistId: string | null;
  customerId: string | null;
};

// Recipient list for the Compose screen — every artist with an email on
// file, plus every customer (gallery/individual) across every artist,
// labelled so the same email address showing up for two artists (a
// shared gallery contact) is never ambiguous about which one this is.
export async function getComposeRecipients(): Promise<ComposeRecipient[]> {
  const [artists, customers] = await Promise.all([
    db.artist.findMany({
      where: { email: { not: null }, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { OR: [{ email: { not: null } }, { contactEmail: { not: null } }] },
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        contactEmail: true,
        artistId: true,
        artist: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const artistRecipients: ComposeRecipient[] = artists
    .filter((a): a is typeof a & { email: string } => !!a.email)
    .map((a) => ({ label: `${a.name} (artist)`, email: a.email, artistId: a.id, customerId: null }));

  // flatMap rather than map+filter(Boolean) (2026-09-05 build fix) —
  // returning [] to skip a customer with no email keeps every element
  // of the resulting array a real ComposeRecipient object directly, so
  // there's no intermediate `| null` union for TypeScript to narrow
  // away, which is what broke the production build here.
  const customerRecipients: ComposeRecipient[] = customers.flatMap((c) => {
    const email = c.contactEmail || c.email;
    if (!email) return [];
    const who = c.contactName ? `${c.contactName}, ${c.name}` : c.name;
    return [{ label: `${who} — ${c.artist.name}`, email, artistId: c.artistId, customerId: c.id }];
  });

  return [...artistRecipients, ...customerRecipients];
}

export async function getAdminEmailAddress(): Promise<string> {
  const settings = await db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  return settings.adminEmailAddress;
}

export async function updateAdminEmailAddress(value: string): Promise<void> {
  const address = value.trim();
  if (!address) return;
  await db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { adminEmailAddress: address },
    create: { id: SINGLETON_ID, adminEmailAddress: address },
  });
  revalidatePath("/accounts/inbox");
}

// Sends an ad hoc email from the general admin address — always that
// one address, never on behalf of a specific artist (see the file-level
// note above), regardless of who the recipient is. Still tags
// artistId/customerId if the recipient was picked from the list (rather
// than typed freehand), purely so it shows up filtered correctly in the
// inbox.
export async function sendAdminEmail(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = ((formData.get("to") as string) || "").trim();
  const subject = ((formData.get("subject") as string) || "").trim();
  const body = ((formData.get("body") as string) || "").trim();
  const artistId = (formData.get("artistId") as string) || null;
  const customerId = (formData.get("customerId") as string) || null;

  if (!to || !subject || !body) {
    return { ok: false, error: "To, subject and message are all required." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't configured — RESEND_API_KEY is missing in Netlify." };
  }

  const fromAddress = await getAdminEmailAddress();
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `Craig, Jevca <${fromAddress}>`,
    to,
    subject,
    text: body,
  });
  if (error) return { ok: false, error: error.message || "Resend could not send the email." };

  await db.outboundEmail.create({
    data: {
      resendEmailId: data?.id || null,
      fromAddress,
      toAddress: to,
      subject,
      body,
      kind: "ADMIN",
      artistId: artistId || null,
      customerId: customerId || null,
    },
  });

  revalidatePath("/accounts/inbox");
  return { ok: true };
}
