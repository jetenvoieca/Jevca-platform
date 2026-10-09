"use client";

import type {
  MailListSummary,
  SubscriberLanguage,
  SubscriberSource,
  SubscriberStatus,
} from "@/lib/actions/subscribers";

// Shared pieces of the Subscribers page (2026-10-08) — its three windows
// (Add subscriber, Import CSV, Add from Customers) and its details panel.

export const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
export const labelCls = "mb-1 block text-xs text-neutral-500";
export const primaryButtonCls =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40";
export const secondaryButtonCls =
  "rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40";

// Bounced: a campaign mail couldn't be delivered (the address doesn't
// exist). Marked as spam: they reported a campaign mail as spam. Neither
// is sent campaigns again unless set back to Subscribed by hand.
export const STATUS_LABEL: Record<SubscriberStatus, string> = {
  SUBSCRIBED: "Subscribed",
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  COMPLAINED: "Marked as spam",
};

export const SOURCE_LABEL: Record<SubscriberSource, string> = {
  MANUAL: "Added by hand",
  IMPORT: "CSV import",
  CUSTOMER: "From Customers",
  WEBSITE: "Website sign-up",
};

// "" in the select = the artist's own default language.
export function LanguageSelect({
  value,
  onChange,
  disabled,
}: {
  value: SubscriberLanguage | null;
  onChange: (value: SubscriberLanguage | null) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "EN" || e.target.value === "FR" ? e.target.value : null)}
      disabled={disabled}
      className={inputCls}
    >
      <option value="">Artist default</option>
      <option value="EN">English</option>
      <option value="FR">French</option>
    </select>
  );
}

// Which list a batch of new subscribers goes into — "" = none.
export function ListSelect({
  lists,
  value,
  onChange,
  disabled,
}: {
  lists: MailListSummary[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>Add to mail list</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className={inputCls}
      >
        <option value="">No list</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Required before anyone is added — mailing someone needs their consent.
export function ConsentCheckbox({
  artistName,
  plural,
  checked,
  onChange,
  disabled,
}: {
  artistName: string;
  plural: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md bg-neutral-50 p-2 text-xs text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span>
        {plural ? "These people have" : "This person has"} agreed to receive emails from{" "}
        {artistName}.
      </span>
    </label>
  );
}
