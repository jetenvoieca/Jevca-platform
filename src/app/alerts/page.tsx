import Link from "next/link";
import AppShell from "@/components/AppShell";
import { getOpenAlerts } from "@/lib/alerts";
import { dismissAlert } from "@/lib/actions/subscriptions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION_PAYMENT_FAILED: "Payment failed",
  SUBSCRIPTION_CANCELLED: "Subscription cancelled",
  SUBSCRIPTION_PAYMENT_OVERDUE: "Payment overdue",
};

export default async function AlertsPage() {
  const alerts = await getOpenAlerts();

  return (
    <AppShell
      publishEnabled={false}
      navItems={[
        { label: "Sites", href: "/" },
        { label: "Alerts", href: "/alerts", active: true, badge: alerts.length },
        { label: "Accounts", href: "/accounts" },
      ]}
      content={
        <div className="mx-auto max-w-3xl px-6 py-6">
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Alerts</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Anything needing your attention. Starting with subscription payments — built to grow
            to other things over time.
          </p>

          {alerts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
              <p className="text-sm text-neutral-500">Nothing needs your attention right now.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-lg border p-4 ${
                    a.severity === "CRITICAL"
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          a.severity === "CRITICAL"
                            ? "bg-red-200 text-red-800"
                            : "bg-amber-200 text-amber-800"
                        }`}
                      >
                        {TYPE_LABELS[a.type] || a.type}
                      </span>
                      <p className="text-sm text-neutral-800">{a.message}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.siteId && (
                        <Link
                          href={`/sites/${a.siteId}`}
                          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs hover:bg-neutral-50"
                        >
                          View site
                        </Link>
                      )}
                      {a.dismissable && (
                        <form action={dismissAlert.bind(null, a.id)}>
                          <button
                            type="submit"
                            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs hover:bg-neutral-50"
                          >
                            Dismiss
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}
