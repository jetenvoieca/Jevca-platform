"use client";

import { useState, useTransition } from "react";
import OwnerCard from "@/components/OwnerCard";
import DomainCard from "@/components/DomainCard";
import SubscriptionCard from "@/components/SubscriptionCard";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import { markSubscriptionUpToDate, cancelSubscription } from "@/lib/actions/clientAlerts";
import type { ClientPanelData } from "@/lib/clientPanelData";
import type { ClientAlertType } from "@/lib/clientAlertIds";

// The centre panel for a payment-overdue or no-payment-method alert
// (2026-09-19, CRM Phase 3; no payment method added 2026-10-09):
// the same Owner / Domain / Subscription cards as Administration →
// Clients, so the missing payment can be recorded right here, followed by
// the action panel. "Up to date" records the client in the Alert view's
// processed list once the payment has been added, or a payment method
// chosen (it refuses until then).
// Cancel subscription (2026-10-09) is for a client who has left — see
// cancelSubscription. Cancel Domain / Email Client are placeholders for
// now.
export default function AlertClientPanel({
  alertType,
  data,
  onDone,
}: {
  alertType: ClientAlertType;
  data: ClientPanelData;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (artistId: string) => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await action(data.artist.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  };

  const handleCancelSubscription = () => {
    if (
      !confirm(
        `Cancel ${data.artist.name}'s subscription? Their site will be archived and no more payment alerts raised. This can be reinstated later from their Subscription card.`
      )
    )
      return;
    run(cancelSubscription);
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
      <div className="flex flex-col gap-4">
        <OwnerCard artist={data.artist} />
        <DomainCard site={data.site} />
      </div>

      <div className="flex flex-col gap-4">
        <SubscriptionCard
          artist={data.artist}
          siteId={data.site.id}
          defaultCurrency={data.site.defaultCurrency}
          subscriptionPayments={data.subscriptionPayments}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ActionPanel
          align="start"
          footer={
            <ActionButton onClick={() => run((artistId) => markSubscriptionUpToDate(artistId, alertType))} disabled={isPending}>
              {isPending ? "Working…" : "Up to date"}
            </ActionButton>
          }
        >
          <ActionButton onClick={handleCancelSubscription} disabled={isPending}>
            Cancel subscription
          </ActionButton>
          <ActionButton onClick={() => {}} disabled title="Not built yet">
            Cancel Domain
          </ActionButton>
          <ActionButton onClick={() => {}} disabled title="Not built yet">
            Email Client
          </ActionButton>
        </ActionPanel>
      </div>
    </div>
  );
}
