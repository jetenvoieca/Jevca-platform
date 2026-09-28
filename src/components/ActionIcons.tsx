import type { ReactNode } from "react";

// Small line icons for list actions (2026-09-28, direct request — the
// hover buttons on a list row became a compact icon panel, see
// SwipeRow). Plain inline SVGs drawn in the current text colour, so they
// follow whatever the button around them sets; no icon library needed.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// A clipboard with a list and a tick — Make task / Open task.
export function TaskIcon() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h2.5" />
      <path d="m13.5 16.5 1.5 1.5 3-3" />
    </Icon>
  );
}

// An open folder — Archive.
export function ArchiveIcon() {
  return (
    <Icon>
      <path d="M3 19V6a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2" />
      <path d="M3 19l2.6-7.2a1 1 0 0 1 .9-.8H21l-2.7 7.3a1 1 0 0 1-.9.7H3z" />
    </Icon>
  );
}

// An in-tray with an arrow up out of it — Move to Inbox.
export function UnarchiveIcon() {
  return (
    <Icon>
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
      <path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6l-2.5-6H16" />
      <path d="M8 7H5.5L3 13" />
      <path d="M12 11V3M9 6l3-3 3 3" />
    </Icon>
  );
}

// A pencil — Edit.
export function EditIcon() {
  return (
    <Icon>
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
      <path d="M14.5 6.5l3 3" />
    </Icon>
  );
}

// A bin — Delete.
export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </Icon>
  );
}
