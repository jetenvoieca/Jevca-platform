"use client";

import type { ReactNode } from "react";
import { useBackdropClose } from "@/lib/useBackdropClose";

// A window with a title over the page (2026-10-08, from the Subscribers
// page; shared with the Campaigns page's Add / Edit window). Clicking
// outside or Close calls onClose, except while `busy`.
export default function FormModal({
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
