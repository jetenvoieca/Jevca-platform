"use server";

import * as sales from "@/lib/purchases";
import { NotAllowedError, requireSiteAccess } from "@/lib/currentUser";
import { customerOwner, requirePurchaseAccess } from "@/lib/recordOwners";
import { db } from "@/lib/db";
import { updateTag } from "next/cache";
import { OPEN_ALERTS_TAG } from "@/lib/alerts";

// Sales and their payments, from the browser (2026-10-26): each checks
// the person logged in has access to the sale (its artwork's client), then
// does the work in lib/purchases.ts — see the notes there.

export type { CardEntry, CardEntryOptions, PaymentDetail, SaleInvoice, PurchaseDetail } from "@/lib/purchases";

// A sale to a gallery: the artwork, the gallery and the site must all be
// the same client's, and one the person may access.
export async function startGallerySale(...args: Parameters<typeof sales.startGallerySale>) {
  const [artworkId, customerId, siteId] = args;
  const { artistId } = await requireSiteAccess(siteId);
  const [artwork, customer] = await Promise.all([
    db.artwork.findUnique({ where: { id: artworkId }, select: { artistId: true } }),
    customerOwner(customerId),
  ]);
  if (artwork?.artistId !== artistId || customer?.artistId !== artistId) throw new NotAllowedError();
  return sales.startGallerySale(...args);
}

export async function createGalleryCardIntent(...args: Parameters<typeof sales.createGalleryCardIntent>) {
  await requirePurchaseAccess(args[0]);
  return sales.createGalleryCardIntent(...args);
}

export async function getGalleryInstalmentDefault(...args: Parameters<typeof sales.getGalleryInstalmentDefault>) {
  await requirePurchaseAccess(args[0]);
  return sales.getGalleryInstalmentDefault(...args);
}

export async function updateGallerySaleAmount(...args: Parameters<typeof sales.updateGallerySaleAmount>) {
  await requirePurchaseAccess(args[0]);
  return sales.updateGallerySaleAmount(...args);
}

// Deleting or cancelling a sale deletes its alerts (see
// AlertEvent.purchaseId), so these three bring the Alert list and nav
// badge up to date straight away.
export async function deleteGallerySale(...args: Parameters<typeof sales.deleteGallerySale>) {
  await requirePurchaseAccess(args[0]);
  const result = await sales.deleteGallerySale(...args);
  updateTag(OPEN_ALERTS_TAG);
  return result;
}

export async function forceDeleteCompletedSale(...args: Parameters<typeof sales.forceDeleteCompletedSale>) {
  await requirePurchaseAccess(args[0]);
  const result = await sales.forceDeleteCompletedSale(...args);
  updateTag(OPEN_ALERTS_TAG);
  return result;
}

export async function recordGalleryPayment(...args: Parameters<typeof sales.recordGalleryPayment>) {
  await requirePurchaseAccess(args[0]);
  return sales.recordGalleryPayment(...args);
}

export async function markSalePaid(...args: Parameters<typeof sales.markSalePaid>) {
  await requirePurchaseAccess(args[0]);
  return sales.markSalePaid(...args);
}

export async function updatePurchaseRelease(...args: Parameters<typeof sales.updatePurchaseRelease>) {
  await requirePurchaseAccess(args[0]);
  return sales.updatePurchaseRelease(...args);
}

export async function abandonPurchase(...args: Parameters<typeof sales.abandonPurchase>) {
  await requirePurchaseAccess(args[0]);
  const result = await sales.abandonPurchase(...args);
  updateTag(OPEN_ALERTS_TAG);
  return result;
}

export async function createCardEntryIntent(...args: Parameters<typeof sales.createCardEntryIntent>) {
  await requirePurchaseAccess(args[0]);
  return sales.createCardEntryIntent(...args);
}

export async function recordPaymentIntent(...args: Parameters<typeof sales.recordPaymentIntent>) {
  await requirePurchaseAccess(args[0]);
  return sales.recordPaymentIntent(...args);
}
