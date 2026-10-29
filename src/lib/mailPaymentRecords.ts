import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { findOrCreateCustomerRecord } from "@/lib/customerRecords";
import { raiseAlertIfNotAlreadyOpen } from "@/lib/alerts";
import { isCurrency } from "@/lib/currencies";
import { EMAIL_DOMAIN } from "@/lib/email";
import type { ButtonPayment } from "@/lib/mailContent";
import { getArtistStripeTarget } from "@/lib/paymentLinks";
import { formatMoney } from "@/lib/currencies";
import { getStripeClient, fromMinorUnits, toMinorUnits, type StripeTarget } from "@/lib/stripe";

// A mail's payment button (2026-10-21, Craig's request — a deposit for a
// commission, before there's an artwork): a Button whose link is a
// Stripe payment link for a fixed amount, in the artist's own Stripe
// account (or Jetenvoieca's), which anyone receiving the mail can pay.
// Stripe's page asks for the payer's name, email and phone. Once paid,
// the payer is added to the artist's Customers, a note with their
// details goes into the artist's Inbox, and an alert is raised. Nothing
// is recorded as a sale — there's no artwork yet.

const KIND = "mailDeposit";
const MAX_DESCRIPTION = 120;
// Same alert as an email arriving at the artist's address — it opens the Inbox.
const EMAIL_ALERT = "EMAIL_REPLY_RECEIVED";

// Makes the payment link (a new one each time the amount or wording
// changes — the old one is switched off, so only the latest can be paid).
export async function createMailPaymentLink(
  artistId: string,
  input: { amount: string; currency: string; description: string; previous: ButtonPayment | null },
): Promise<{ payment: ButtonPayment; url: string } | { error: string }> {
  const amount = Number(String(input.amount).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above 0." };
  const currency = String(input.currency).toUpperCase();
  if (!isCurrency(currency)) return { error: "Choose a currency." };
  const description = String(input.description ?? "")
    .trim()
    .slice(0, MAX_DESCRIPTION);
  if (!description) return { error: "Say what it's for — it's shown on Stripe's page." };

  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { name: true } });
  if (!artist) return { error: "Artist not found." };
  const target = await getArtistStripeTarget(artistId);

  try {
    const link = await getStripeClient(target).paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: toMinorUnits(amount),
            product_data: { name: description },
          },
          quantity: 1,
        },
      ],
      name_collection: { individual: { enabled: true, optional: false } },
      phone_number_collection: { enabled: true },
      metadata: { kind: KIND, artistId },
      payment_intent_data: { metadata: { kind: KIND, artistId } },
      after_completion: {
        type: "hosted_confirmation",
        hosted_confirmation: { custom_message: `Thank you — ${artist.name} will be in touch soon.` },
      },
    });
    // The link it replaces is switched off — only ever this client's own.
    if (input.previous && (await mailPaymentLinkOwner(input.previous))?.artistId === artistId) {
      await deactivateMailPaymentLink(input.previous);
    }
    return {
      url: link.url,
      payment: {
        amount: amount.toFixed(2),
        currency,
        description,
        linkId: link.id,
        mode: target.mode,
        accountId: target.accountId,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe couldn't make the payment link." };
  }
}

// Which client a payment link was made for (2026-10-26) — from the link
// itself, in the Stripe account it was made in. Null if it can't be read.
export async function mailPaymentLinkOwner(payment: ButtonPayment): Promise<{ artistId: string } | null> {
  try {
    const link = await getStripeClient({ mode: payment.mode, accountId: payment.accountId }).paymentLinks.retrieve(
      String(payment.linkId),
    );
    return link.metadata?.artistId ? { artistId: link.metadata.artistId } : null;
  } catch {
    return null;
  }
}

// Switches a payment link off, so it can no longer be paid — when the
// button goes back to an ordinary link, or a new link replaces it.
export async function deactivateMailPaymentLink(payment: ButtonPayment): Promise<void> {
  try {
    await getStripeClient({ mode: payment.mode, accountId: payment.accountId }).paymentLinks.update(
      String(payment.linkId),
      { active: false },
    );
  } catch (err) {
    console.warn(`[mail payment] couldn't switch off ${payment.linkId}:`, err);
  }
}

// Called by the Stripe webhook when a payment succeeds whose metadata
// says it came from a mail's payment button. Reads the payment back from
// the account it was made in (`target`, from the webhook) rather than
// trusting the event, and notes it once.
export async function recordMailDeposit(paymentIntentId: string, target: StripeTarget): Promise<void> {
  const stripe = getStripeClient(target);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded" || intent.metadata?.kind !== KIND) return;
  const artistId = intent.metadata.artistId;
  if (!artistId) return;

  const already = await db.inboundEmail.findUnique({
    where: { stripePaymentIntentId: intent.id },
    select: { id: true },
  });
  if (already) return;

  const artist = await db.artist.findUnique({
    where: { id: artistId },
    select: { id: true, emailSlug: true, email: true },
  });
  if (!artist) return;

  const session = (await stripe.checkout.sessions.list({ payment_intent: intent.id, limit: 1 })).data[0];
  const details = session?.customer_details;
  const email = details?.email ?? intent.receipt_email ?? null;
  const name = details?.name || email || "Someone";
  const phone = details?.phone ?? null;
  const description = session
    ? ((await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })).data[0]?.description ?? "Deposit")
    : "Deposit";
  const amount = formatMoney(fromMinorUnits(intent.amount_received), intent.currency.toUpperCase());

  const customer = await findOrCreateCustomerRecord(artistId, { name, email });
  if (phone) {
    await db.customer.updateMany({ where: { id: customer.id, phone: null }, data: { phone } });
  }

  const subject = `Deposit paid: ${description} — ${amount}`;
  await db.inboundEmail.create({
    data: {
      stripePaymentIntentId: intent.id,
      fromAddress: email ?? "",
      fromName: name,
      toAddress: artist.emailSlug ? `${artist.emailSlug}@${EMAIL_DOMAIN}` : (artist.email ?? ""),
      mailbox: "ART",
      artistId,
      customerId: customer.id,
      subject,
      textBody: [
        `${name} paid ${amount} — "${description}" — with the payment button in a mail.`,
        "",
        `Email: ${email ?? "—"}`,
        `Phone: ${phone ?? "—"}`,
        "",
        "They've been added to your Customers. The payment is in Stripe.",
      ].join("\n"),
    },
  });
  await raiseAlertIfNotAlreadyOpen({
    artistId,
    type: EMAIL_ALERT,
    severity: "WARNING",
    message: `Deposit paid: ${name}, ${amount} — check the inbox.`,
  });
  revalidatePath("/accounts/inbox");
  revalidatePath("/alerts");
}
