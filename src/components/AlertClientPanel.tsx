"use client";

import { useState, useTransition } from "react";
import OwnerCard from "@/components/OwnerCard";
import DomainCard from "@/components/DomainCard";
import SubscriptionCard from "@/components/SubscriptionCard";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import { markSubscriptionUpToDate } from "@/lib/actions/clientAlerts";
import type { ClientPanelData } from "@/lib/clientPanelData";

// The centre panel for a payment-overdue alert (2026-09-19, CRM Phase 3):
// the same Owner / Domain / Subscription cards as Administration →
// Clients, so the missing payment can be recorded right here, followed by
// the action panel. "Up to date" logs the client in the Done list once
// the payment has been added (it refuses until then). Cancel
// subscription / Cancel Domain / Email Client are placeholders for now.
export default function AlertClientPanel({
  data,
  onDone,
}: {
  data: ClientPanelData;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleUpToDate = () => {
    setError(null);
    startTransition(async () => {
      const res = await markSubscriptionUpToDate(data.artist.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
      <div className="flex flex-col gap-4">
        <OwnerCard artist={data.artist} />
        <DomainCard site={data.site} templates={data.templates} />
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
            <ActionButton onClick={handleUpToDate} disabled={isPending}>
              {isPending ? "Checking…" : "Up to date"}
            </ActionButton>
          }
        >
          <ActionButton onClick={() => {}} disabled title="Not built yet">
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
