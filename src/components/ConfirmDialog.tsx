"use client";

// Built 2026-08-13 to replace native confirm() for sale-related actions —
// confirm()'s buttons are always labelled "OK" / "Cancel" and can't be
// changed, which is genuinely confusing for an action itself called
// "Cancel": the dialog's own "Cancel" button (meaning "don't do this")
// sits right next to an action called "Cancel sale", with opposite
// meanings. Every button here says exactly what it does instead.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Go back",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-base font-semibold text-neutral-900">{title}</h3>
        <p className="mb-5 text-sm text-neutral-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-neutral-900 hover:bg-neutral-800"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
