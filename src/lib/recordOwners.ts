import { db } from "@/lib/db";
import { NotAllowedError, requireArtistAccess, requireRecordAccess, type CurrentUser } from "@/lib/currentUser";

// Which client a record belongs to (2026-10-26), for the access checks
// in lib/currentUser.ts — the records that don't carry their client's id
// directly (a purchase is its artwork's), or are checked by id alone.

export function purchaseOwner(purchaseId: string): Promise<{ artistId: string } | null> {
  return db.purchase
    .findUnique({ where: { id: purchaseId }, select: { artwork: { select: { artistId: true } } } })
    .then((p) => p?.artwork ?? null);
}

export function customerOwner(customerId: string): Promise<{ artistId: string } | null> {
  return db.customer.findUnique({ where: { id: customerId }, select: { artistId: true } });
}

export function invoiceOwner(invoiceId: string): Promise<{ artistId: string } | null> {
  return db.invoice.findUnique({ where: { id: invoiceId }, select: { artistId: true } });
}

export function statementOwner(statementId: string): Promise<{ artistId: string } | null> {
  return db.statement.findUnique({ where: { id: statementId }, select: { artistId: true } });
}

// Several purchases, all of which the person logged in must have access
// to (and all found).
export async function requirePurchasesAccess(purchaseIds: string[]): Promise<CurrentUser> {
  const rows = await db.purchase.findMany({
    where: { id: { in: purchaseIds } },
    select: { artwork: { select: { artistId: true } } },
  });
  const owners = new Set(rows.map((r) => r.artwork.artistId));
  if (rows.length !== new Set(purchaseIds).size || owners.size !== 1) throw new NotAllowedError();
  return requireArtistAccess([...owners][0]);
}

export const requirePurchaseAccess = (purchaseId: string) => requireRecordAccess(purchaseOwner(purchaseId));
export const requireCustomerAccess = (customerId: string) => requireRecordAccess(customerOwner(customerId));
export const requireInvoiceAccess = (invoiceId: string) => requireRecordAccess(invoiceOwner(invoiceId));
export const requireStatementAccess = (statementId: string) => requireRecordAccess(statementOwner(statementId));
