"use server";

import * as invoices from "@/lib/invoiceRecords";
import { requireInvoiceAccess, requirePurchaseAccess, requirePurchasesAccess } from "@/lib/recordOwners";

// Invoices, from the browser (2026-10-26): each checks the person logged
// in has access to the invoice or its sales, then does the work in
// lib/invoiceRecords.ts (the Stripe webhook calls that directly).

export type { InvoiceWindowData } from "@/lib/invoiceRecords";

export async function produceInvoice(...args: Parameters<typeof invoices.produceInvoice>) {
  await requirePurchasesAccess(args[0]);
  return invoices.produceInvoice(...args);
}

export async function invoiceForSale(...args: Parameters<typeof invoices.invoiceForSale>) {
  await requirePurchaseAccess(args[0]);
  return invoices.invoiceForSale(...args);
}

export async function getInvoiceWindow(...args: Parameters<typeof invoices.getInvoiceWindow>) {
  await requireInvoiceAccess(args[0]);
  return invoices.getInvoiceWindow(...args);
}

export async function ensureInvoicePaymentLink(...args: Parameters<typeof invoices.ensureInvoicePaymentLink>) {
  await requireInvoiceAccess(args[0]);
  return invoices.ensureInvoicePaymentLink(...args);
}

export async function createInvoiceCardIntent(...args: Parameters<typeof invoices.createInvoiceCardIntent>) {
  await requireInvoiceAccess(args[0]);
  return invoices.createInvoiceCardIntent(...args);
}

export async function markInvoicePaid(...args: Parameters<typeof invoices.markInvoicePaid>) {
  await requireInvoiceAccess(args[0]);
  return invoices.markInvoicePaid(...args);
}

export async function recordInvoicePaymentIntent(...args: Parameters<typeof invoices.recordInvoicePaymentIntent>) {
  await requireInvoiceAccess(args[0]);
  return invoices.recordInvoicePaymentIntent(...args);
}

export async function cancelInvoice(...args: Parameters<typeof invoices.cancelInvoice>) {
  await requireInvoiceAccess(args[0]);
  return invoices.cancelInvoice(...args);
}
