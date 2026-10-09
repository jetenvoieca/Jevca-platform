"use client";

import { useState, useTransition } from "react";
import {
  deleteSubscriber,
  setSubscriberLists,
  setSubscriberStatus,
  updateSubscriber,
  type MailListSummary,
  type SubscriberInput,
  type SubscriberRow,
} from "@/lib/actions/subscribers";
import { formatDate } from "@/lib/formatDate";
import ConfirmDialog from "@/components/ConfirmDialog";
import SubscriberCampaignHistory from "@/components/SubscriberCampaignHistory";
import {
  LanguageSelect,
  SOURCE_LABEL,
  STATUS_LABEL,
  inputCls,
  labelCls,
} from "@/components/subscriberFormParts";

type Result = SubscriberRow | { error: string };

// One subscriber's details on the Subscribers page (2026-10-08). Each
// field saves as soon as it's changed (text fields when you leave them).
export default function SubscriberDetailPanel({
  artistId,
  subscriber,
  lists,
  onChange,
  onDeleted,
  onClose,
}: {
  artistId: string;
  subscriber: SubscriberRow;
  lists: MailListSummary[];
  onChange: (row: SubscriberRow) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<Result>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onChange(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const saveField = (field: keyof SubscriberInput, value: string) => {
    if ((subscriber[field] ?? "") === value) return;
    run(() => updateSubscriber(subscriber.id, artistId, { [field]: value }));
  };

  const toggleList = (listId: string) => {
    const next = subscriber.listIds.includes(listId)
      ? subscriber.listIds.filter((id) => id !== listId)
      : [...subscriber.listIds, listId];
    run(() => setSubscriberLists(subscriber.id, artistId, next));
  };

  const handleDelete = () => {
    setConfirmingDelete(false);
    startTransition(async () => {
      await deleteSubscriber(subscriber.id, artistId);
      onDeleted(subscriber.id);
    });
  };

  const name = [subscriber.firstName, subscriber.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="truncate text-lg font-semibold text-neutral-900">
          {name || subscriber.email}
        </h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Keyed by subscriber so the fields reset when another is opened. */}
      <div key={subscriber.id} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>First name</label>
            <input
              type="text"
              defaultValue={subscriber.firstName ?? ""}
              onBlur={(e) => saveField("firstName", e.target.value.trim())}
              disabled={isPending}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Last name</label>
            <input
              type="text"
              defaultValue={subscriber.lastName ?? ""}
              onBlur={(e) => saveField("lastName", e.target.value.trim())}
              disabled={isPending}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            defaultValue={subscriber.email}
            onBlur={(e) => saveField("email", e.target.value.trim().toLowerCase())}
            disabled={isPending}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Language</label>
          <LanguageSelect
            value={subscriber.language}
            onChange={(language) =>
              run(() => updateSubscriber(subscriber.id, artistId, { language }))
            }
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={subscriber.status}
            onChange={(e) =>
              run(() =>
                setSubscriberStatus(
                  subscriber.id,
                  artistId,
                  e.target.value === "SUBSCRIBED" ? "SUBSCRIBED" : "UNSUBSCRIBED"
                )
              )
            }
            disabled={isPending}
            className={inputCls}
          >
            <option value="SUBSCRIBED">{STATUS_LABEL.SUBSCRIBED}</option>
            <option value="UNSUBSCRIBED">{STATUS_LABEL.UNSUBSCRIBED}</option>
            {(subscriber.status === "BOUNCED" || subscriber.status === "COMPLAINED") && (
              <option value={subscriber.status} disabled>
                {STATUS_LABEL[subscriber.status]}
              </option>
            )}
          </select>
          {subscriber.status === "BOUNCED" && (
            <p className="mt-1 text-xs text-neutral-500">
              A campaign mail couldn&apos;t be delivered to this address, so no more are sent. Correct the
              email and set Subscribed to start again.
            </p>
          )}
          {subscriber.status === "COMPLAINED" && (
            <p className="mt-1 text-xs text-neutral-500">
              They marked a campaign mail as spam, so no more are sent. Only set Subscribed if they ask.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Mail lists</label>
          {lists.length === 0 ? (
            <p className="text-xs text-neutral-400">No mail lists yet.</p>
          ) : (
            <div className="space-y-1">
              {lists.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={subscriber.listIds.includes(l.id)}
                    onChange={() => toggleList(l.id)}
                    disabled={isPending}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <dl className="space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          <div>
            <dt className="inline text-neutral-400">Added: </dt>
            <dd className="inline">
              {formatDate(subscriber.createdAt)} — {SOURCE_LABEL[subscriber.source]}
            </dd>
          </div>
          {subscriber.consentAt && (
            <div>
              <dt className="inline text-neutral-400">Consent given: </dt>
              <dd className="inline">{formatDate(subscriber.consentAt)}</dd>
            </div>
          )}
          {subscriber.unsubscribedAt && (
            <div>
              <dt className="inline text-neutral-400">Unsubscribed: </dt>
              <dd className="inline">{formatDate(subscriber.unsubscribedAt)}</dd>
            </div>
          )}
        </dl>

        <SubscriberCampaignHistory subscriberId={subscriber.id} artistId={artistId} />

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && <p className="text-xs text-green-600">Saved</p>}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${name || subscriber.email}?`}
        message="This removes every detail of this subscriber. To stop sending them mail but keep them from being added again, set their Status to Unsubscribed instead. Can't be undone."
        confirmLabel="Delete permanently"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
