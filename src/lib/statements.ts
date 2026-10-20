import { db } from "@/lib/db";
import { saleBreakdown } from "@/lib/saleMath";
import { documentSaleInclude } from "@/lib/invoices";

// Shared server-side helpers for statements (2026-10-20) — see Statement
// in schema.prisma and lib/actions/statements.ts. Not a "use server"
// file, so the PDF route and the emails can use them without them
// becoming actions the browser could call directly.

// What a statement line needs beyond the sale itself: the invoice it's
// on now, if any.
const statementSaleInclude = {
  ...documentSaleInclude,
  invoice: { select: { number: true, paidAt: true, cancelledAt: true } },
};

// A statement with everything its document, email and links need: its
// gallery, artist, and each listed sale in order.
export async function loadStatement(statementId: string) {
  return db.statement.findUnique({
    where: { id: statementId },
    relationLoadStrategy: "query",
    include: {
      artist: true,
      customer: true,
      lines: { orderBy: { position: "asc" }, include: { purchase: { include: statementSaleInclude } } },
    },
  });
}

export type LoadedStatement = NonNullable<Awaited<ReturnType<typeof loadStatement>>>;
export type StatementSale = LoadedStatement["lines"][number]["purchase"];

// Every sale at a gallery still owed something, oldest first — what a
// new statement lists.
export async function owedGallerySales(customerId: string) {
  const sales = await db.purchase.findMany({
    where: { customerId, channel: "GALLERY", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { payments: true },
    relationLoadStrategy: "query",
  });
  return sales.filter((s) => saleBreakdown(s).balance > 0);
}

// The invoice a listed sale is on now — an unpaid one not cancelled.
export function liveInvoiceNumber(sale: StatementSale): number | null {
  const invoice = sale.invoice;
  return invoice && !invoice.paidAt && !invoice.cancelledAt ? invoice.number : null;
}

// Who a statement is for: the gallery's contact person if one is on file,
// else its general email.
export function statementParty(customer: LoadedStatement["customer"]) {
  return {
    email: customer.contactEmail || customer.email || null,
    firstName: customer.contactName?.trim().split(/\s+/)[0] || customer.name || null,
  };
}
