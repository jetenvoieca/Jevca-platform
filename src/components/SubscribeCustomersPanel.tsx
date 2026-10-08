"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  listSubscribableCustomers,
  subscribeCustomers,
  type BulkAddResult,
  type MailListSummary,
  type SubscribableCustomer,
} from "@/lib/actions/subscribers";
import {
  ConsentCheckbox,
  ListSelect,
  primaryButtonCls,
} from "@/components/subscriberFormParts";
import FormModal from "@/components/FormModal";

// Marketing → Subscribers → Add from Customers (2026-10-08): ticks the
// artist's individual customers who have an email address. Customers
// already on file as subscribers are shown but can't be ticked.
export default function SubscribeCustomersPanel({
  artistId,
  artistName,
  lists,
  initialListId,
  onAdded,
  onClose,
}: {
  artistId: string;
  artistName: string;
  lists: MailListSummary[];
  initialListId: string | null;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [customers, setCustomers] = useState<SubscribableCustomer[] | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listId, setListId] = useState<string | null>(initialListId);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listSubscribableCustomers(artistId).then(setCustomers);
  }, [artistId]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (customers ?? []).filter(
      (c) => !needle || c.name.toLowerCase().includes(needle) || c.email.includes(needle)
    );
  }, [customers, q]);

  const selectable = visible.filter((c) => !c.alreadySubscriber);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of selectable) {
        if (allVisibleSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  const handleAdd = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await subscribeCustomers(artistId, [...selected], listId, consent);
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      setResult(outcome);
      onAdded();
    });
  };

  if (result) {
    return (
      <FormModal title="Add from Customers" busy={false} onClose={onClose}>
        <p className="text-sm text-neutral-700">
          {result.added} added
          {result.alreadyOnFile > 0 && `, ${result.alreadyOnFile} already on file (left unchanged)`}.
        </p>
        <button type="button" onClick={onClose} className={primaryButtonCls}>
          Done
        </button>
      </FormModal>
    );
  }

  return (
    <FormModal title="Add from Customers" busy={isPending} onClose={onClose}>
      {customers === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-neutral-500">No customers with an email address yet.</p>
      ) : (
        <>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={selectable.length === 0}
            />
            Select all{q.trim() ? " shown" : ""}
          </label>
          <ul className="max-h-64 divide-y divide-neutral-100 overflow-y-auto rounded-md border border-neutral-200">
            {visible.map((c) => (
              <li key={c.id}>
                <label
                  className={`flex items-center gap-2 px-3 py-2 text-sm ${
                    c.alreadySubscriber ? "text-neutral-400" : "text-neutral-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    disabled={c.alreadySubscriber}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {c.name} — {c.email}
                  </span>
                  {c.alreadySubscriber && <span className="shrink-0 text-xs">On file</span>}
                </label>
              </li>
            ))}
          </ul>
          <ListSelect lists={lists} value={listId} onChange={setListId} />
          <ConsentCheckbox
            artistName={artistName}
            plural={selected.size !== 1}
            checked={consent}
            onChange={setConsent}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || selected.size === 0 || !consent}
            className={primaryButtonCls}
          >
            {isPending
              ? "Adding…"
              : `Add ${selected.size} subscriber${selected.size === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </FormModal>
  );
}
