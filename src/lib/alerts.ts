import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/formatDate";
import type { SaleModalTarget } from "@/components/SaleModal";

// 2026-08-13 decision: manual (PayPal/DD) artists are expected roughly
// monthly, flagged overdue 14 days after that's due — i.e. 44 days since
// their last recorded payment. Artists with no payment history at all are
// deliberately not flagged (nothing to measure from — likely still
// onboarding).
const MANUAL_OVERDUE_DAYS = 30 + 14;

// 2026-09-19 decision: a sale whose invoice has been emailed but has had
// no payment received or recorded is overdue once more than 30 days have
// passed since that email went out. See SALE_INVOICE_OVERDUE below.
const INVOICE_OVERDUE_DAYS = 30;

// Stored alert types that link somewhere other than a site's Settings
// page — see storedAlertLink below. EMAIL_REPLY_RECEIVED (2026-09-05,
// Email Integration) links to the Inbox; SALE_RECORDED (2026-09-21, raised
// when an artist records a sale from the Studio app) links to the site's
// Sales page.
const EMAIL_ALERT_TYPE = "EMAIL_REPLY_RECEIVED";
const SALE_RECORDED_ALERT_TYPE = "SALE_RECORDED";

// Cache tag for the open-alerts scan below — server actions that change
// what would be flagged (dismissing an alert, recording a subscription
// payment, marking a client up to date) expire it with updateTag so the
// Inbox's Alert list and the nav badge update straight away rather than
// up to a minute later.
export const OPEN_ALERTS_TAG = "open-alerts";

// The overdue-payment alert is computed rather than stored, and its id
// deliberately embeds the artist's id (2026-09-19, CRM Phase 3) — so the
// Inbox can open that client's panel from the alert's id alone, even
// after the alert itself has cleared (e.g. once a payment is recorded).
const OVERDUE_ALERT_ID_PREFIX = "manual-overdue-";

export function overdueAlertId(artistId: string): string {
  return `${OVERDUE_ALERT_ID_PREFIX}${artistId}`;
}

// The artist id inside an overdue-payment alert's id, or null if this
// isn't an overdue-payment alert id.
export function overdueAlertArtistId(alertId: string): string | null {
  return alertId.startsWith(OVERDUE_ALERT_ID_PREFIX) ? alertId.slice(OVERDUE_ALERT_ID_PREFIX.length) : null;
}

function daysSince(date: Date, now = Date.now()): number {
  return Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
}

// Live check of the same rule the overdue-payment alert uses, for one
// artist — used by "Up to date" (see markSubscriptionUpToDate) to refuse
// clearing an alert whose underlying problem is still there.
export async function isArtistSubscriptionOverdue(artistId: string): Promise<boolean> {
  const artist = await db.artist.findFirst({
    where: { id: artistId, paymentMethod: { in: ["PayPal", "DD"] } },
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

// One alert for every sale recorded from the Studio app (2026-09-21).
// Deliberately NOT de-duplicated like raiseAlertIfNotAlreadyOpen above:
// each sale is its own piece of news, dismissed individually from the
// Inbox. WARNING because the Alerts list only distinguishes WARNING
// (amber) from CRITICAL (red).
export async function raiseSaleRecordedAlert(params: {
  artistId: string;
  message: string;
}): Promise<void> {
  await db.alertEvent.create({
    data: {
      artistId: params.artistId,
      type: SALE_RECORDED_ALERT_TYPE,
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

// Where a stored alert's link goes and what it says: the Inbox for an
// email reply, the site's Sales page for a recorded sale, otherwise the
// site's Settings page.
function storedAlertLink(
  type: string,
  artistId: string | null,
  siteId: string | null
): { href: string | null; label: string } {
  if (type === EMAIL_ALERT_TYPE) {
    return {
      href: `/accounts/inbox${artistId ? `?artistId=${artistId}` : ""}`,
      label: "View inbox",
    };
  }
  if (type === SALE_RECORDED_ALERT_TYPE) {
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
        include: { artist: { select: { id: true, name: true, sites: { select: { id: true }, where: { status: { not: "ARCHIVED" } }, take: 1 } } } },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      }),
      db.artist.findMany({
        where: {
          paymentMethod: { in: ["PayPal", "DD"] },
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
              artwork: {
                select: {
                  presentationTitle: true,
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
      // A sale whose invoice was emailed more than INVOICE_OVERDUE_DAYS ago
      // and still has no payment received or recorded (2026-09-19). Gallery
      // sales have no Payment rows at all until they're marked paid, so
      // the Payment-based check above can never see them — this looks at
      // the sale itself instead.
      db.purchase.findMany({
        where: {
          status: "ACTIVE",
          invoiceEmailedAt: { lt: new Date(now - INVOICE_OVERDUE_DAYS * 24 * 60 * 60 * 1000) },
          payments: { none: { status: "PAID" } },
        },
        select: {
          id: true,
          artworkId: true,
          channel: true,
          buyerName: true,
          totalAmount: true,
          commissionPercent: true,
          currency: true,
          invoiceEmailedAt: true,
          artwork: {
            select: {
              presentationTitle: true,
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
        orderBy: { invoiceEmailedAt: "asc" },
      }),
    ]);

  const storedItems: AlertItem[] = stored.map((a) => {
    const siteId = a.artist?.sites[0]?.id || null;
    const link = storedAlertLink(a.type, a.artistId, siteId);
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
        id: overdueAlertId(artist.id),
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
      id: `no-payment-method-${artist.id}`,
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

  const unpaidInvoiceItems: AlertItem[] = unpaidPayments.map((p) => {
    const artist = p.purchase.artwork.artist;
    const siteId = artist.sites[0]?.id || null;
    const daysOverdue = p.dueDate ? daysSince(p.dueDate, now) : 0;
    const buyer = p.purchase.buyerName || "unnamed buyer";
    const failedNote = p.status === "FAILED" ? " (payment attempt failed)" : "";
    return {
      id: `unpaid-invoice-${p.id}`,
      type: "SALE_INVOICE_UNPAID",
      severity: daysOverdue > 30 ? "CRITICAL" : "WARNING",
      message: `${artist.name}: invoice to ${buyer} for "${p.purchase.artwork.presentationTitle}" — ${p.currency} ${parseFloat(p.amount.toString()).toFixed(2)}, ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue${failedNote}.`,
      artistId: p.purchase.artwork.artistId,
      artistName: artist.name,
      siteId,
      linkHref: siteId ? `/sites/${siteId}/sales` : null,
      linkLabel: "View sales",
      createdAt: (p.dueDate || new Date()).toISOString(),
      dismissable: false,
    };
  });

  const overdueInvoiceItems: AlertItem[] = overdueInvoices.map((p) => {
    const artist = p.artwork.artist;
    const siteId = artist.sites[0]?.id || null;
    const sentAt = p.invoiceEmailedAt!; // Never null — the query above requires it.
    const days = daysSince(sentAt, now);
    // A gallery is invoiced for the net amount (sale price less
    // commission); a Stripe sale for the full price.
    const total = parseFloat(p.totalAmount.toString());
    const commission = p.commissionPercent ? parseFloat(p.commissionPercent.toString()) : 0;
    const owed = p.channel === "GALLERY" ? total - total * (commission / 100) : total;
    const buyer = p.buyerName || "unnamed buyer";
    return {
      id: `invoice-overdue-${p.id}`,
      type: "SALE_INVOICE_OVERDUE",
      severity: days - INVOICE_OVERDUE_DAYS > 30 ? "CRITICAL" : "WARNING",
      message: `${artist.name}: invoice to ${buyer} for "${p.artwork.presentationTitle}" — ${p.currency} ${owed.toFixed(2)}, sent ${formatDate(sentAt)} (${days} days ago) and still unpaid.`,
      artistId: p.artwork.artistId,
      artistName: artist.name,
      siteId,
      linkHref: null,
      linkLabel: "View sale",
      createdAt: sentAt.toISOString(),
      dismissable: false,
      sale: { purchaseId: p.id, artworkId: p.artworkId, artistId: p.artwork.artistId, siteId },
    };
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
