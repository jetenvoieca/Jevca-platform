"use server";

import * as mailPayments from "@/lib/mailPaymentRecords";
import { requireArtistAccess, requireRecordAccess } from "@/lib/currentUser";

// A mail's payment button, from the browser (2026-10-26): checked, then
// the work in lib/mailPaymentRecords.ts (the Stripe webhook records
// deposits there directly).

export async function createMailPaymentLink(...args: Parameters<typeof mailPayments.createMailPaymentLink>) {
  await requireArtistAccess(args[0]);
  return mailPayments.createMailPaymentLink(...args);
}

export async function deactivateMailPaymentLink(...args: Parameters<typeof mailPayments.deactivateMailPaymentLink>) {
  await requireRecordAccess(mailPayments.mailPaymentLinkOwner(args[0]));
  return mailPayments.deactivateMailPaymentLink(...args);
}
