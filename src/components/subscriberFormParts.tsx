"use client";

import type { ReactNode } from "react";
import { useBackdropClose } from "@/lib/useBackdropClose";
import type {
  MailListSummary,
  SubscriberLanguage,
  SubscriberSource,
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

// A window over the Subscribers page. Clicking outside or Close calls
// onClose, except while `busy`.
export function SubscriberModal({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const backdrop = useBackdropClose(() => {
    if (!busy) onClose();
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between px-6 pt-5">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-neutral-400 hover:text-neutral-700"
            >
              Close ✕
            </button>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>
  );
}
