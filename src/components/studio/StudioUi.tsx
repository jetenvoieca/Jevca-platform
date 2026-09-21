import type { ReactNode } from "react";

// Look-and-feel shared by every Studio screen — see the design mock-ups:
// cream panels, large dark-grey buttons, white fields.

export type Notice = { text: string; tone: "info" | "error" };

export const panelCls = "rounded-lg border border-[#cfcac0] bg-[#f8f5ee]";

// 16px minimum text so iPhone doesn't zoom the page when a field is tapped.
export const fieldCls =
  "w-full rounded-md border border-[#c4c4c4] bg-white px-3 py-3 text-center text-lg";

const buttonCls =
  "flex h-32 flex-1 items-center justify-center rounded-lg bg-[#5a5a5a] px-2 text-center text-xl leading-tight text-white active:bg-[#444] disabled:opacity-50";

export function StudioButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={buttonCls}>
      {children}
    </button>
  );
}

export function NoticeLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={`text-center text-lg ${notice.tone === "error" ? "text-red-700" : "text-[#555]"}`}
    >
      {notice.text}
    </p>
  );
}
