"use server";

import { db } from "@/lib/db";
import { recordPaymentIntent, startArtworkSaleAndEnterCard, type CardEntry } from "@/lib/actions/payments";
import { isValidEmail, normalizeEmail } from "@/lib/emailAddress";
import { holdEndsAt, releaseExpiredHolds } from "@/lib/paymentHolds";
import { checkWebsiteVisitor } from "@/lib/turnstile";

// A visitor buying a work on the website (2026-10-19, Craig's choices),
// from the Presentation window's payment form (WorkPaymentForm): in full
// or in instalments, by card through Stripe, into the artist's own
// Stripe account (or Jetenvoieca's) — the same direct sale the Studio
// app's Enter Card makes (lib/actions/payments.ts), at the work's own
// price and the artist's number of instalments. Only when the site takes
// payments (Settings → Take payments).
//
// Starting to pay holds the work as Sold - Not Paid for 30 minutes (see
// lib/paymentHolds.ts); it becomes SOLD once the payment is recorded,
// and the artist gets an alert. Stripe emails the buyer each receipt.
//
// Called from the published page, so nothing sent from the browser is
// trusted beyond which site and work, the choice and what was typed: the
// artist and price come from the site and the work, the visitor must
// pass Cloudflare Turnstile's check on one of the site's own addresses
// (see checkWebsiteVisitor), and a payment is only recorded once Stripe
// itself confirms it.

export type BuyerAddress = { line1: string; city: string; postcode: string; country: string };

export type WebsitePaymentStart = ({ ok: true; purchaseId: string } & CardEntry) | { error: string };

const UNAVAILABLE = "Buying online isn't available right now — please try again later, or enquire.";
const MAX_FIELD = 200;

export async function startWebsitePayment(input: {
  siteId: string;
  artworkId: string;
  instalments: boolean;
  name: string;
  email: string;
  address: BuyerAddress;
  token: string;
}): Promise<WebsitePaymentStart> {
  const name = String(input.name ?? "").trim();
  const email = normalizeEmail(String(input.email ?? ""));
  const address = {
    line1: String(input.address?.line1 ?? "").trim(),
    city: String(input.address?.city ?? "").trim(),
    postcode: String(input.address?.postcode ?? "").trim(),
    country: String(input.address?.country ?? "").trim(),
  };
  if (!name) return { error: "Please enter your name." };
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
  if (!address.line1 || !address.city || !address.postcode || !address.country) {
    return { error: "Please enter your full address." };
  }
  if ([name, ...Object.values(address)].some((v) => v.length > MAX_FIELD)) {
    return { error: "Please shorten what you've typed." };
  }

  const site = await db.site.findUnique({
    where: { id: String(input.siteId) },
    select: { id: true, domain: true, salesEnabled: true, artistId: true },
  });
  if (!site?.salesEnabled) return { error: UNAVAILABLE };
  const artworkId = String(input.artworkId);
  const artwork = await db.artwork.findFirst({
    where: { id: artworkId, artistId: site.artistId },
    select: { offeredPrice: true, priceCurrency: true },
  });
  if (!artwork?.offeredPrice || Number(artwork.offeredPrice) <= 0) return { error: UNAVAILABLE };

  const visitor = await checkWebsiteVisitor(site.domain, String(input.token ?? ""));
  if (visitor === "elsewhere") return { error: UNAVAILABLE };
  if (visitor === "robot") return { error: "We couldn't check you're not a robot — please try again." };

  // Someone else's hold on this work may have just run out.
  await releaseExpiredHolds(artworkId);
  const current = await db.artwork.findUnique({ where: { id: artworkId }, select: { availability: true } });
  if (current?.availability !== "AVAILABLE") {
    return { error: "Sorry — someone else is buying this work right now, or it has just been sold." };
  }

  const formData = new FormData();
  formData.set("currency", artwork.priceCurrency);
  formData.set("type", input.instalments ? "INSTALMENTS" : "FULL");
  formData.set("source", "Website");
  formData.set("buyerName", name);
  formData.set("buyerEmail", email);

  const started = await startArtworkSaleAndEnterCard(artworkId, site.id, formData, { receipt: true });
  if (!started.ok) {
    console.warn(`[website payment] ${artworkId}: ${started.error}`);
    return { error: UNAVAILABLE };
  }
  await db.purchase.update({
    where: { id: started.purchaseId },
    data: {
      holdUntil: holdEndsAt(),
      buyerAddress: [address.line1, `${address.city} ${address.postcode}`, address.country].join("\n"),
    },
  });

  return {
    ok: true,
    purchaseId: started.purchaseId,
    clientSecret: started.clientSecret,
    publishableKey: started.publishableKey,
    stripeAccount: started.stripeAccount,
  };
}

// Called once the buyer's browser reports Stripe took the payment.
// recordPaymentIntent asks Stripe itself whether it succeeded and belongs
// to this sale before recording it, so this can't be faked; the Stripe
// webhook records it too if this never arrives.
export async function confirmWebsitePayment(input: {
  siteId: string;
  purchaseId: string;
  paymentIntentId: string;
}): Promise<{ ok: true } | { error: string }> {
  const purchase = await db.purchase.findFirst({
    where: { id: String(input.purchaseId), artwork: { artist: { sites: { some: { id: String(input.siteId) } } } } },
    select: { id: true },
  });
  if (!purchase) return { error: "Sale not found." };
  await recordPaymentIntent(purchase.id, String(input.paymentIntentId));
  return { ok: true };
}
