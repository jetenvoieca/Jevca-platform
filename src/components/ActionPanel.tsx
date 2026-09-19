import type { ReactNode } from "react";

// The common scheme for "action buttons" (2026-09-19): the buttons where
// you decide what to do with the information you've been shown (Save
// Task, Task Completed, and later Cancel subscription, Email Client,
// Up to date, etc.). They always sit together in a cream panel, as narrow
// dark-grey buttons with cream text — use these two components rather
// than styling a one-off button, so every action area looks the same.
//   Panel:  #F9F6EF background
//   Button: #5E5E5E background, #F9F6EF text
export function ActionPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-3 rounded-md border border-[#5E5E5E] bg-[#F9F6EF] p-5">
      {children}
    </div>
  );
}

export function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-36 rounded bg-[#5E5E5E] px-3 py-1.5 text-sm text-[#F9F6EF] hover:bg-[#4a4a4a] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
