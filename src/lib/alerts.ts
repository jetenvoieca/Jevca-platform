import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/formatDate";
import { saleBreakdown, saleTitle } from "@/lib/saleMath";
import { formatInvoiceNumber } from "@/lib/invoiceNumber";
import { invoiceExtras } from "@/lib/invoices";
import type { SaleModalTarget } from "@/components/SaleModal";
import { MANUAL_SUBSCRIPTION_METHODS } from "@/lib/subscriptionMethods";
import { clientAlertId } from "@/lib/clientAlertIds";

// 2026-08-13 decision: manual (PayPal/DD) artists are expected roughly
// monthly, flagged overdue 14 days after that's due — i.e. 44 days since
// their last recorded payment. Artists with no payment history at all are
// deliberately not flagged (nothing to measure from — likely still
// onboarding), and neither are clients whose subscription has been
// cancelled (2026-10-09, see cancelSubscription).
const MANUAL_OVERDUE_DAYS = 30 + 14;

// An invoice still unpaid is overdue once more than the client's own
// Artist.invoiceOverdueDays (default 21) have passed since it was
// produced — whether or not it has been emailed (2026-10-20, direct
// request; was 30 days from emailing). It turns critical this many days
// after that. See SALE_INVOICE_OVERDUE below.
const INVOICE_CRITICAL_AFTER_DAYS = 30;

// The ids of every overdue invoice (see above). In SQL, since each
// invoice is measured against its own client's number of days.
async function findOverdueInvoiceIds(): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT i."id" FROM "Invoice" i
    JOIN "Artist" a ON a."id" = i."artistId"
    WHERE i."paidAt" IS NULL AND i."cancelledAt" IS NULL
      AND i."createdAt" < NOW() - make_interval(days => a."invoiceOverdueDays")`;
  return rows.map((r) => r.id);
}

// Stored alert types that link somewhere other than a site's Settings
// page — see storedAlertLink below. EMAIL_REPLY_RECEIVED (2026-09-05,
// Email Integration) links to the Inbox. The two sale types (2026-09-21)
// are raised by the Studio app and link to the site's Sales page:
// SALE_RECORDED when a sale is recorded or a card payment is taken,
// SALE_LINK_CREATED when a payment link is created for a buyer. Each
// carries the sale it is about (AlertEvent.purchaseId), so the Inbox
// opens that sale just as the Sales page does.
const EMAIL_ALERT_TYPE = "EMAIL_REPLY_RECEIVED";
export const SALE_RECORDED_ALERT_TYPE = "SALE_RECORDED";
export const SALE_LINK_ALERT_TYPE = "SALE_LINK_CREATED";
const SALE_ALERT_TYPES = [SALE_RECORDED_ALERT_TYPE, SALE_LINK_ALERT_TYPE];

// Cache tag for the open-alerts scan below — server actions that change
// what would be flagged (dismissing an alert, recording a subscription
// payment, marking a client up to date) expire it with updateTag so the
// Inbox's Alert list and the nav badge update straight away rather than
// up to a minute later.
export const OPEN_ALERTS_TAG = "open-alerts";

function daysSince(date: Date, now = Date.now()): number {
  return Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
}

// Live check of the same rule the overdue-payment alert uses, for one
// artist — used by "Up to date" (see markSubscriptionUpToDate) to refuse
// clearing an alert whose underlying problem is still there.
export async function isArtistSubscriptionOverdue(artistId: string): Promise<boolean> {
  const artist = await db.artist.findFirst({
    where: { id: artistId, paymentMethod: { in: MANUAL_SUBSCRIPTION_METHODS }, subscriptionCancelledAt: null },
    select: { subscriptionPayments: { orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true } } },
  });
  const last = artist?.subscriptionPayments[0];
  return !!last && daysSince(last.paidAt) > MANUAL_OVERDUE_DAYS;
}

export type AlertItem = {
  id: string;
  type: string;
  severity: "WARNING" | "CRITICAL";
  message: string;
  artistId: string | null;
  artistName: string | null;
  siteId: string | null;
  linkHref: string | null;
  linkLabel: string;
  createdAt: string;
  dismissable: boolean;
  // Set for alerts about one specific sale — the Inbox opens the same
  // sale modal as Consolidated Sales for these (see SaleModal).
  sale?: SaleModalTarget;
};

// Generic "raise this alert if one isn't already open for this artist +
// type" helper, shared by anything that raises a stored AlertEvent —
// originally lived only in platformSubscriptionSync.ts (subscription
// payment failures/cancellations), pulled out here (2026-09-05) so
// inboundEmail.ts's EMAIL_REPLY_RECEIVED alert can use the exact same
// dedupe logic instead of a second copy of it.
export async function raiseAlertIfNotAlreadyOpen(params: {
  artistId: string;
  type: string;
  severity: "WARNING" | "CRITICAL";
  message: string;
}): Promise<void> {
  const existing = await db.alertEvent.findFirst({
    where: { artistId: params.artistId, type: params.type, resolvedAt: null },
  });
  if (existing) return; // Already flagged — don't spam a fresh row per retry/redelivery.
  await db.alertEvent.create({
    data: {
      artistId: params.artistId,
      type: params.type,
      severity: params.severity,
      message: params.message,
    },
  });
}

// One alert per sale event raised from the Studio app (2026-09-21).
// Unlike raiseAlertIfNotAlreadyOpen above, several can be open for the
// same artist at once — each sale is its own piece of news, dismissed
// individually from the Inbox — but an identical open alert is never
// duplicated, so repeating the same step (a retry, or the Stripe webhook
// and the app both reporting one payment) raises it only once. Remembers
// which sale it is about, so the Inbox can open that sale. WARNING
// because the Alerts list only distinguishes WARNING (amber) from
// CRITICAL (red).
export async function raiseSaleAlert(params: {
  artistId: string;
  purchaseId: string;
  type: typeof SALE_RECORDED_ALERT_TYPE | typeof SALE_LINK_ALERT_TYPE;
  message: string;
}): Promise<void> {
  const existing = await db.alertEvent.findFirst({
    where: {
      artistId: params.artistId,
      type: params.type,
      message: params.message,
      resolvedAt: null,
    },
  });
  if (existing) return;
  await db.alertEvent.create({
    data: {
      artistId: params.artistId,
      purchaseId: params.purchaseId,
      type: params.type,
      severity: "WARNING",
      message: params.message,
    },
  });
}

// Resolves every currently-open alert of a given type for an artist —
// the other half of raiseAlertIfNotAlreadyOpen above, same shared-helper
// reasoning.
export async function resolveAlertsOfType(artistId: string, type: string): Promise<void> {
  await db.alertEvent.updateMany({
    where: { artistId, type, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

// Where a stored alert's link goes and what it says: the Dashboard for an
// email reply, the site's Sales page for a sale, otherwise the site's
// Settings page.
function storedAlertLink(type: string, siteId: string | null): { href: string | null; label: string } {
  if (type === EMAIL_ALERT_TYPE) return { href: "/accounts/dashboard", label: "View dashboard" };
  if (SALE_ALERT_TYPES.includes(type)) {
    return { href: siteId ? `/sites/${siteId}/sales` : null, label: "View sales" };
  }
  return { href: siteId ? `/sites/${siteId}` : null, label: "View settings" };
}

// getOpenAlerts scans every artist and every payment across the whole
// platform (it's not scoped to one site), and it's called on every single
// navigation inside every site — plus on the sites picker screen. With a
// handful of sites that's cheap; with 100+ sites it means a full
// database scan on every click.
//
// 2026-08-31: none of these alerts need to be accurate to the second —
// an overdue payment or a missing payment method being reflected up to a
// minute late is a non-issue for what is essentially a dashboard badge.
// So the actual scan is cached for 60 seconds (Next.js data cache) and
// every navigation within that window reuses the same result instead of
// re-querying. This is the main fix for the "everything feels sluggish"
// reports — this scan was being paid for on almost every click.
const getOpenAlertsUncached = async (): Promise<AlertItem[]> => {
  const now = Date.now();

  const [stored, manualCandidates, noPaymentMethodArtists, unpaidPayments, overdueInvoices] =
    await Promise.all([
      db.alertEvent.findMany({
        where: { resolvedAt: null },
        include: {
          artist: { select: { id: true, name: true, sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 } } },
          // Which artwork a sale alert's sale is for, so the Inbox can open it.
          purchase: { select: { artworkId: true } },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      }),
      db.artist.findMany({
        where: {
          paymentMethod: { in: MANUAL_SUBSCRIPTION_METHODS },
          subscriptionCancelledAt: null,
          sites: { some: { status: { not: "ARCHIVED" } } },
        },
        select: {
          id: true,
          name: true,
          sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 },
          subscriptionPayments: { orderBy: { paidAt: "desc" }, take: 1 },
        },
      }),
      // No payment method chosen at all yet — an ongoing gap, not a
      // point-in-time event, so computed live like the overdue check below
      // rather than stored (2026-08-13).
      db.artist.findMany({
        where: {
          OR: [{ paymentMethod: null }, { paymentMethod: "" }],
          subscriptionCancelledAt: null,
          sites: { some: { status: { not: "ARCHIVED" } } },
        },
        select: {
          id: true,
          name: true,
          sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 },
        },
      }),
      // A buyer's own invoice that's past its due date and still unpaid —
      // this is about the ARTIST's sale to THEIR buyer, unrelated to the
      // artist's own subscription to us, but the same "needs chasing"
      // shape, so it lives on the same dashboard (2026-08-13). A row with
      // no dueDate set never matches `lt: now` in Postgres, so those are
      // naturally excluded without an extra null check.
      db.payment.findMany({
        where: {
          status: { in: ["DUE", "FAILED"] },
          dueDate: { lt: new Date() },
          purchase: { status: "ACTIVE" },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          dueDate: true,
          purchase: {
            select: {
              buyerName: true,
              chargeKind: true,
              artwork: {
                select: {
                  catalogueName: true,
                  artistId: true,
                  artist: {
                    select: {
                      name: true,
                      sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
      // An overdue invoice (2026-09-19; by invoice since 2026-10-14, so an
      // invoice covering several sales is one alert). Gallery sales have
      // no Payment rows until they're paid, so the Payment-based check
      // above can never see them.
      findOverdueInvoiceIds().then((ids) =>
        db.invoice.findMany({
          where: { id: { in: ids } },
          relationLoadStrategy: "query",
          select: {
            id: true,
            number: true,
            currency: true,
            createdAt: true,
            emailedAt: true,
            artistId: true,
            framingCost: true,
            deliveryCost: true,
            payments: { select: { amount: true, status: true } },
            artist: {
              select: {
                name: true,
                invoiceOverdueDays: true,
                sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 },
              },
            },
            sales: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                artworkId: true,
                buyerName: true,
                totalAmount: true,
                commissionPercent: true,
                depositPaid: true,
                framingCost: true,
                deliveryCost: true,
                chargeKind: true,
                artwork: { select: { catalogueName: true } },
                payments: { select: { amount: true, status: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      ),
    ]);

  const storedItems: AlertItem[] = stored.map((a) => {
    const siteId = a.artist?.sites[0]?.id || null;
    const link = storedAlertLink(a.type, siteId);
    return {
      id: a.id,
      type: a.type,
      severity: a.severity as "WARNING" | "CRITICAL",
      message: a.message,
      artistId: a.artistId,
      artistName: a.artist?.name || null,
      siteId,
      linkHref: link.href,
      linkLabel: link.label,
      createdAt: a.createdAt.toISOString(),
      dismissable: true,
      // A sale alert opens its sale, like the overdue-invoice alerts below.
      sale:
        a.purchaseId && a.purchase && a.artistId
          ? {
              purchaseId: a.purchaseId,
              artworkId: a.purchase.artworkId,
              artistId: a.artistId,
              siteId,
            }
          : undefined,
    };
  });

  const overdueItems: AlertItem[] = [];
  for (const artist of manualCandidates) {
    const last = artist.subscriptionPayments[0];
    if (!last) continue; // No history yet — not flagged (2026-08-13 decision).
    const days = daysSince(last.paidAt, now);
    if (days > MANUAL_OVERDUE_DAYS) {
      const siteId = artist.sites[0]?.id || null;
      overdueItems.push({
        id: clientAlertId("SUBSCRIPTION_PAYMENT_OVERDUE", artist.id),
        type: "SUBSCRIPTION_PAYMENT_OVERDUE",
        severity: "WARNING",
        message: `${artist.name}: no subscription payment recorded in ${days} days (last: ${formatDate(last.paidAt)}).`,
        artistId: artist.id,
        artistName: artist.name,
        siteId,
        linkHref: siteId ? `/sites/${siteId}` : null,
        linkLabel: "View settings",
        createdAt: last.paidAt.toISOString(),
        dismissable: false,
      });
    }
  }

  const noPaymentMethodItems: AlertItem[] = noPaymentMethodArtists.map((artist) => {
    const siteId = artist.sites[0]?.id || null;
    return {
      id: clientAlertId("SUBSCRIPTION_METHOD_MISSING", artist.id),
      type: "SUBSCRIPTION_METHOD_MISSING",
      severity: "WARNING",
      message: `${artist.name}: no subscription payment method set.`,
      artistId: artist.id,
      artistName: artist.name,
      siteId,
      linkHref: siteId ? `/sites/${siteId}` : null,
      linkLabel: "View settings",
      createdAt: new Date(0).toISOString(), // No natural date — sorts last within its severity.
      dismissable: false,
    };
  });

  // Only a sale's scheduled instalments are ever DUE — an invoice's own
  // payments are always recorded already paid.
  const unpaidInvoiceItems: AlertItem[] = unpaidPayments.flatMap((p) => {
    if (!p.purchase) return [];
    const purchase = p.purchase;
    const artist = purchase.artwork.artist;
    const siteId = artist.sites[0]?.id || null;
    const daysOverdue = p.dueDate ? daysSince(p.dueDate, now) : 0;
    const buyer = purchase.buyerName || "unnamed buyer";
    const failedNote = p.status === "FAILED" ? " (payment attempt failed)" : "";
    return [{
      id: `unpaid-invoice-${p.id}`,
      type: "SALE_INVOICE_UNPAID",
      severity: daysOverdue > 30 ? "CRITICAL" : "WARNING",
      message: `${artist.name}: invoice to ${buyer} for "${saleTitle(purchase.artwork.catalogueName, purchase.chargeKind)}" — ${p.currency} ${parseFloat(p.amount.toString()).toFixed(2)}, ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue${failedNote}.`,
      artistId: purchase.artwork.artistId,
      artistName: artist.name,
      siteId,
      linkHref: siteId ? `/sites/${siteId}/sales` : null,
      linkLabel: "View sales",
      createdAt: (p.dueDate || new Date()).toISOString(),
      dismissable: false,
    }];
  });

  const overdueInvoiceItems: AlertItem[] = overdueInvoices.flatMap((invoice) => {
    const first = invoice.sales[0];
    if (!first) return [];
    const siteId = invoice.artist.sites[0]?.id || null;
    const days = daysSince(invoice.createdAt, now);
    // What's still owed — each sale's balance (lib/saleMath.ts) plus the
    // invoice's own framing and delivery (lib/invoices.ts).
    const owed =
      invoice.sales.reduce((sum, s) => sum + saleBreakdown(s).balance, 0) + invoiceExtras(invoice).balance;
    const buyer = first.buyerName || "unnamed buyer";
    const what =
      invoice.sales.length === 1
        ? `"${saleTitle(first.artwork.catalogueName, first.chargeKind)}"`
        : `${invoice.sales.length} works`;
    return [
      {
        id: `invoice-overdue-${invoice.id}`,
        type: "SALE_INVOICE_OVERDUE",
        severity: days - invoice.artist.invoiceOverdueDays > INVOICE_CRITICAL_AFTER_DAYS ? "CRITICAL" : "WARNING",
        message: `${invoice.artist.name}: invoice ${formatInvoiceNumber(invoice.number)} to ${buyer} for ${what} — ${invoice.currency} ${owed.toFixed(2)}, invoiced ${formatDate(invoice.createdAt)} (${days} days ago), ${invoice.emailedAt ? `sent ${formatDate(invoice.emailedAt)}` : "not emailed"}, still unpaid.`,
        artistId: invoice.artistId,
        artistName: invoice.artist.name,
        siteId,
        linkHref: null,
        linkLabel: "View sale",
        createdAt: invoice.createdAt.toISOString(),
        dismissable: false,
        sale: { purchaseId: first.id, artworkId: first.artworkId, artistId: invoice.artistId, siteId },
      },
    ];
  });

  return [
    ...storedItems,
    ...overdueItems,
    ...noPaymentMethodItems,
    ...unpaidInvoiceItems,
    ...overdueInvoiceItems,
  ].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "CRITICAL" ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

const cachedGetOpenAlerts = unstable_cache(getOpenAlertsUncached, ["open-alerts"], {
  revalidate: 60,
  tags: [OPEN_ALERTS_TAG],
});

export async function getOpenAlerts(): Promise<AlertItem[]> {
  return cachedGetOpenAlerts();
}
