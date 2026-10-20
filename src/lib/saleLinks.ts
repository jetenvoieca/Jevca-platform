import { db } from "@/lib/db";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { getStripeClientForSale, toMinorUnits } from "@/lib/stripe";
import { artworkDetailLines } from "@/lib/artworkDetails";
import { publicMediaUrl } from "@/lib/r2";
import type { DocumentSale } from "@/lib/invoices";

// Payment links for consigned sales (2026-10-20) — persistent Stripe
// Payment Links (not Checkout Sessions, which expire within a day), used
// by invoices (lib/actions/invoices.ts) and statements
// (lib/actions/statements.ts). Not a "use server" file, so none of this
// can be called from the browser.
//
// Each work shows as its own product: its name, picture and details
// (type, size, medium, and how the amount was reached), with `label` —
// who it's from and the document — at the start of its details (under
// the page's "View details") and by the Pay button. The page's own
// heading is the Stripe account's name, which can't be set per link. The
// id that recognises a payment rides on the PaymentIntent's own metadata
// (Payment Link metadata doesn't reach it).

export type LineItem = { price: string; quantity: number };

// "Artist – Site name" — who a payment link is from.
export async function payFromLabel(artist: { id: string; name: string }): Promise<string> {
  const site = await db.site.findFirst({
    where: { artistId: artist.id, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { name: true },
  });
  return [artist.name, site?.name].filter(Boolean).join(" – ");
}

// One work as a line item for its balance, with its product.
export async function workLineItem(sale: DocumentSale, label: string): Promise<LineItem> {
  const stripe = getStripeClientForSale(sale);
  const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: sale.currency }).format(n);
  const b = saleBreakdown(sale);
  const deductions = [
    b.commission ? `less ${b.commissionPercent}% commission` : null,
    b.deposit ? `less ${money(b.deposit)} deposit paid` : null,
    b.paid ? `less ${money(b.paid)} already paid` : null,
  ].filter(Boolean);
  const description = [
    label,
    artworkDetailLines(sale.artwork).join(" · "),
    deductions.length ? `Sale price ${money(b.salePrice)}, ${deductions.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  const imageKey = sale.artwork.mainImage?.displayKey ?? sale.artwork.images[0]?.displayKey;
  const imageUrl = publicMediaUrl(imageKey);
  const product = await stripe.products.create({
    name: saleTitle(sale.artwork.catalogueName, sale.chargeKind),
    ...(description ? { description } : {}),
    ...(imageUrl?.startsWith("https://") ? { images: [imageUrl] } : {}),
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: toMinorUnits(b.balance),
    currency: sale.currency.toLowerCase(),
  });
  return { price: price.id, quantity: 1 };
}

// A sale still owed something, and payable on its own by link (not being
// paid by Stripe instalments).
export function isOwed(sale: DocumentSale): boolean {
  return sale.status === "ACTIVE" && !sale.stripeSubscriptionScheduleId && saleBreakdown(sale).balance > 0;
}

// One work's own link, for its whole balance — kept on the sale
// (Purchase.stripePaymentLinkUrl) and reused until retired
// (retireSalePaymentLink, lib/invoices.ts). `description` is what the
// payment is listed as in Stripe.
export async function ensureWorkPaymentLink(sale: DocumentSale, label: string, description: string) {
  if (sale.stripePaymentLinkUrl || !isOwed(sale)) return;
  const link = await getStripeClientForSale(sale).paymentLinks.create({
    line_items: [await workLineItem(sale, label)],
    custom_text: { submit: { message: label } },
    metadata: { purchaseId: sale.id },
    payment_intent_data: { description, metadata: { purchaseId: sale.id } },
  });
  await db.purchase.update({
    where: { id: sale.id },
    data: { stripePaymentLinkId: link.id, stripePaymentLinkUrl: link.url },
  });
}
