import { db } from "@/lib/db";

// 2026-08-13 decision: manual (PayPal/DD) artists are expected roughly
// monthly, flagged overdue 14 days after that's due — i.e. 44 days since
// their last recorded payment. Artists with no payment history at all are
// deliberately not flagged (nothing to measure from — likely still
// onboarding).
const MANUAL_OVERDUE_DAYS = 30 + 14;

export type AlertItem = {
  id: string;
  type: string;
  severity: "WARNING" | "CRITICAL";
  message: string;
  artistId: string | null;
  artistName: string | null;
  siteId: string | null;
  createdAt: string;
  dismissable: boolean;
};

export async function getOpenAlerts(): Promise<AlertItem[]> {
  const [stored, manualCandidates, noPaymentMethodArtists] = await Promise.all([
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
  ]);

  const storedItems: AlertItem[] = stored.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity as "WARNING" | "CRITICAL",
    message: a.message,
    artistId: a.artistId,
    artistName: a.artist?.name || null,
    siteId: a.artist?.sites[0]?.id || null,
    createdAt: a.createdAt.toISOString(),
    dismissable: true,
  }));

  const now = Date.now();
  const overdueItems: AlertItem[] = [];
  for (const artist of manualCandidates) {
    const last = artist.subscriptionPayments[0];
    if (!last) continue; // No history yet — not flagged (2026-08-13 decision).
    const daysSince = Math.floor((now - last.paidAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > MANUAL_OVERDUE_DAYS) {
      overdueItems.push({
        id: `manual-overdue-${artist.id}`,
        type: "SUBSCRIPTION_PAYMENT_OVERDUE",
        severity: "WARNING",
        message: `${artist.name}: no subscription payment recorded in ${daysSince} days (last: ${last.paidAt.toLocaleDateString()}).`,
        artistId: artist.id,
        artistName: artist.name,
        siteId: artist.sites[0]?.id || null,
        createdAt: last.paidAt.toISOString(),
        dismissable: false,
      });
    }
  }

  const noPaymentMethodItems: AlertItem[] = noPaymentMethodArtists.map((artist) => ({
    id: `no-payment-method-${artist.id}`,
    type: "SUBSCRIPTION_METHOD_MISSING",
    severity: "WARNING",
    message: `${artist.name}: no subscription payment method set.`,
    artistId: artist.id,
    artistName: artist.name,
    siteId: artist.sites[0]?.id || null,
    createdAt: new Date(0).toISOString(), // No natural date — sorts last within its severity.
    dismissable: false,
  }));

  return [...storedItems, ...overdueItems, ...noPaymentMethodItems].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "CRITICAL" ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
