import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getStripeClientForSale, type SaleStripeFields, type StripeTarget } from "@/lib/stripe";

// Shared server-side helpers for Stripe accounts and payment links. Kept
// out of the "use server" actions files so they can be used by several
// without becoming actions the browser could call directly.

// Where a NEW sale of this artist's work should be taken (2026-09-25,
// Stripe Connect): the artist's own mode, and their own linked Stripe
// account for that mode if they have one — otherwise Jetenvoieca's own
// account (accountId null). Read once, when a sale is created, and stored
// on the Purchase (stripeMode/stripeAccountId); everything after that uses
// the sale's stored values, never this.
export async function getArtistStripeTarget(artistId: string): Promise<StripeTarget> {
  const artist = await db.artist.findUniqueOrThrow({
    where: { id: artistId },
    select: { stripeMode: true, stripeConnections: { select: { mode: true, accountId: true } } },
  });
  const connection = artist.stripeConnections.find((c) => c.mode === artist.stripeMode);
  return { mode: artist.stripeMode, accountId: connection?.accountId ?? null };
}

// The same, in the shape stored on a new Purchase row.
export async function saleStripeFieldsForArtist(artistId: string): Promise<SaleStripeFields> {
  const target = await getArtistStripeTarget(artistId);
  return { stripeMode: target.mode, stripeAccountId: target.accountId };
}

// Deactivates one payment link in the Stripe account of the sale or
// invoice it belongs to. A Stripe-side failure never blocks the local
// change — worst case the old link stays technically live in Stripe a
// little longer.
export async function deactivatePaymentLink(sale: SaleStripeFields, linkId: string | null) {
  if (!linkId) return;
  try {
    await getStripeClientForSale(sale).paymentLinks.update(linkId, { active: false });
  } catch {
    // See note above.
  }
}

// What a sale owes has changed (paid, edited, moved, cancelled or
// deleted): the link of any current statement listing it is switched off.
export async function retireStatementLinksListing(saleId: string) {
  await retireStatementPaymentLinks({ closedAt: null, lines: { some: { purchaseId: saleId } } });
}

// Switches off the payment link of every current, unpaid statement
// matching `where` (2026-10-20, see Statement in schema.prisma) — what it
// charges has changed (a listed sale paid, edited, cancelled or deleted),
// or its gallery is being deleted. A fresh statement is made the next
// time Statement is opened.
export async function retireStatementPaymentLinks(where: Prisma.StatementWhereInput) {
  const statements = await db.statement.findMany({
    where: { ...where, paidAt: null, stripePaymentLinkId: { not: null } },
    select: { id: true, stripeMode: true, stripeAccountId: true, stripePaymentLinkId: true },
  });
  for (const statement of statements) {
    if (statement.stripeMode) {
      await deactivatePaymentLink(
        { stripeMode: statement.stripeMode, stripeAccountId: statement.stripeAccountId },
        statement.stripePaymentLinkId
      );
    }
    await db.statement.update({
      where: { id: statement.id },
      data: { stripePaymentLinkId: null, stripePaymentLinkUrl: null },
    });
  }
}
