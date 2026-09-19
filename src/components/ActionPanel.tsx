import type { ReactNode } from "react";

// The common scheme for "action buttons" (2026-09-19): the buttons where
// you decide what to do with the information you've been shown (Save
// Task, Task Completed, Up to date, Dismiss, etc.). They always sit
// together in a cream panel, as narrow dark-grey buttons with cream text
// — use these two components rather than styling a one-off button, so
// every action area looks the same.
//   Panel:  #F9F6EF background
//   Button: #5E5E5E background, #F9F6EF text
//
// `align` sets which side the stacked buttons hug (default: right).
// `footer` is for the one main button that belongs alone at the
// bottom-right of the panel (e.g. "Up to date").
export function ActionPanel({
  children,
  align = "end",
  footer,
}: {
  children: ReactNode;
  align?: "start" | "end";
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-[#5E5E5E] bg-[#F9F6EF] p-5">
      <div className={`flex flex-col gap-3 ${align === "end" ? "items-end" : "items-start"}`}>{children}</div>
      {footer && <div className="mt-8 flex justify-end">{footer}</div>}
    </div>
  );
}

export function ActionButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-[27px] w-40 rounded bg-[#5E5E5E] px-2 text-sm text-[#F9F6EF] hover:bg-[#4a4a4a] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
