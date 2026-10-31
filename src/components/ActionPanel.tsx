import type { ReactNode } from "react";

// The common scheme for "action buttons" (2026-09-19): the buttons where
// you decide what to do with the information you've been shown (Save
// Task, Task Completed, Up to date, Dismiss, etc.). They always sit
// together in a cream panel, as narrow outlined buttons — use these components rather than styling a one-off button, so
// every action area looks the same.
//   Panel:  #F9F6EF background, #5E5E5E border
//   Button: #F9F6EF background, #5E5E5E border and text (outlined rather
//   than filled since 2026-10-15, Craig's mock-up — a block of filled
//   buttons looked heavy)
//
// `align` sets which side the stacked buttons hug (default: right).
// `footer` is for the one main button that belongs alone at the
// bottom-right of the panel (e.g. "Up to date"). `aside` is content
// shown on the left of the buttons (2026-10-31 — an alert's instruction
// text).
//
// The mini action bar (2026-10-01, direct request — see mock-up) is the
// same panel and buttons, sized to fit a header such as an opened
// email's: less padding, narrower buttons, two to a row.

// Shared by every panel, so they can't drift apart — also used by the
// sale window's action column in Locations (GalleriesView).
export const ACTION_PANEL_LOOK = "rounded-md border border-[#5E5E5E] bg-[#F9F6EF]";
// The outlined look itself (no size), also used by the sale buttons in
// locations so every action button looks the same.
export const ACTION_BUTTON_LOOK =
  "border border-[#5E5E5E] bg-[#F9F6EF] text-sm text-[#5E5E5E] hover:bg-[#EDE8DC] disabled:opacity-50";
const BUTTON_CLS = `h-[27px] rounded px-2 ${ACTION_BUTTON_LOOK}`;

export function ActionPanel({
  children,
  align = "end",
  footer,
  aside,
}: {
  children: ReactNode;
  align?: "start" | "end";
  footer?: ReactNode;
  aside?: ReactNode;
}) {
  const buttons = (
    <div className={`flex flex-col gap-3 ${align === "end" ? "items-end" : "items-start"}`}>{children}</div>
  );
  return (
    <div className={`${ACTION_PANEL_LOOK} p-5`}>
      {aside ? (
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">{aside}</div>
          <div className="shrink-0">{buttons}</div>
        </div>
      ) : (
        buttons
      )}
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
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${BUTTON_CLS} w-40`}>
      {children}
    </button>
  );
}

// On a tablet or wider it fills the height of the row it sits in; on a
// phone it sits under the details, at its own size.
export function MiniActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${ACTION_PANEL_LOOK} grid shrink-0 grid-cols-2 content-center gap-2 self-start p-3 sm:self-stretch`}
    >
      {children}
    </div>
  );
}

export function MiniActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BUTTON_CLS} w-28`}>
      {children}
    </button>
  );
}
