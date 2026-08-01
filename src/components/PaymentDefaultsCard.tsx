"use client";

import { useState, useTransition } from "react";
import { updatePaymentDefaults } from "@/lib/actions/artworkSettings";

export default function PaymentDefaultsCard({
  artistId,
  siteId,
  defaultInstalmentCount,
  defaultReleaseMessage,
  defaultReleaseTriggerCount,
}: {
  artistId: string;
  siteId: string;
  defaultInstalmentCount: number;
  defaultReleaseMessage: string;
  defaultReleaseTriggerCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-neutral-900">Payments defaults</h3>
      <p className="mb-4 text-xs text-neutral-500">
        Starting point for every new Payment plan — each artwork can still override these
        individually.
      </p>
      <form
        action={(formData) => {
          startTransition(async () => {
            await updatePaymentDefaults(artistId, siteId, formData);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          });
        }}
        className="space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Default number of instalments
          </label>
          <input
            type="number"
            name="defaultInstalmentCount"
            min={2}
            defaultValue={defaultInstalmentCount}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Default release message
          </label>
          <textarea
            name="defaultReleaseMessage"
            defaultValue={defaultReleaseMessage}
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Default release trigger (payments)
          </label>
          <input
            type="number"
            name="defaultReleaseTriggerCount"
            min={1}
            defaultValue={defaultReleaseTriggerCount}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Save
          </button>
          {saved && <span className="text-xs text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
