"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  menuBackground,
  menuHeight,
  menuSide,
  type MenuStyleLayout,
} from "@/lib/menuStyleLayout";

// One menu entry — a Live Page. With `href` it's a link; without (the
// Menus page preview) choosing it only shows what would happen.
export type MenuViewItem = { id: string; title: string; href?: string };

const SHADOW_CLASS = { none: "", soft: "shadow-md", strong: "shadow-2xl" } as const;

// Space between the button / tab and the screen's edges, in pixels.
const EDGE = 16;

// A site's menu, drawn in its Menu Style (2026-10-06) — see
// lib/menuStyleLayout.ts. The items are the site's Live Pages.
// - Menu button: opens the list in a panel down the button's side of
//   the screen.
// - Side tab: a tab on the screen's edge that slides the list out when
//   hovered or tapped.
// - `phone`: either kind opens full screen.
// - Floating closes the menu once a page is chosen; Fixed leaves it
//   open (a Fixed tab also stays open when the pointer leaves it).
// `contained` places it within the nearest positioned box instead of
// the screen — the Menus page preview's desktop and phone frames.
export default function MenuView({
  layout,
  items,
  currentId,
  phone,
  contained = false,
  defaultOpen = false,
}: {
  layout: MenuStyleLayout;
  items: MenuViewItem[];
  currentId: string | null;
  phone: boolean;
  contained?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const side = menuSide(layout.position);
  const height = menuHeight(layout.position);
  const place = contained ? "absolute" : "fixed";
  const floating = layout.behaviour === "floating";

  const surface: CSSProperties = {
    backgroundColor: menuBackground(layout),
    color: layout.textColor,
    backdropFilter: layout.blur ? `blur(${layout.blur}px)` : undefined,
    WebkitBackdropFilter: layout.blur ? `blur(${layout.blur}px)` : undefined,
  };
  const shadow = SHADOW_CLASS[layout.shadow];

  // Where the button / tab sits.
  const anchor: CSSProperties = {
    [side]: layout.kind === "tab" ? 0 : EDGE,
    ...(height === "top" && { top: EDGE }),
    ...(height === "bottom" && { bottom: EDGE }),
    ...(height === "middle" && { top: "50%", transform: "translateY(-50%)" }),
  };

  const choose = () => {
    if (floating) setOpen(false);
  };

  const list = (size: number, centred: boolean) => (
    <ul className={`flex flex-col gap-1 ${centred ? "items-center" : ""}`}>
      {items.map((item) => (
        <li key={item.id}>
          <MenuEntry
            item={item}
            current={item.id === currentId}
            highlight={layout.highlightColor}
            rounding={layout.rounding}
            size={size}
            onChoose={choose}
          />
        </li>
      ))}
    </ul>
  );

  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close menu"
      className="p-2 opacity-70 hover:opacity-100"
      style={{ color: layout.textColor }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );

  // Phones: the whole screen, whichever kind.
  const fullScreen = open && phone && (
    <div className={`${place} inset-0 z-50 flex flex-col overflow-y-auto p-4`} style={surface}>
      <div className={`flex ${side === "left" ? "justify-start" : "justify-end"}`}>
        {closeButton}
      </div>
      <nav className="flex flex-1 items-center justify-center py-6">
        {list(Math.round(layout.textSize * 1.4), true)}
      </nav>
    </div>
  );

  if (layout.kind === "tab") {
    const tab = (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menu"
        className={`px-1.5 py-4 ${shadow}`}
        style={{
          ...surface,
          borderRadius:
            side === "right"
              ? `${layout.rounding}px 0 0 ${layout.rounding}px`
              : `0 ${layout.rounding}px ${layout.rounding}px 0`,
        }}
      >
        <span className="block text-xs tracking-widest [writing-mode:vertical-rl]">MENU</span>
      </button>
    );

    if (phone) {
      return (
        <>
          <div className={`${place} z-40`} style={anchor}>
            {tab}
          </div>
          {fullScreen}
        </>
      );
    }

    const panel = (
      <div
        className={`overflow-hidden transition-[max-width] duration-300 ease-out ${shadow}`}
        style={{ ...surface, maxWidth: open ? 280 : 0 }}
      >
        <div className="w-[240px] p-3">{list(layout.textSize, false)}</div>
      </div>
    );

    return (
      <nav
        className={`${place} z-40 flex items-center ${side === "left" ? "flex-row-reverse" : ""}`}
        style={anchor}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => floating && setOpen(false)}
      >
        {tab}
        {panel}
      </nav>
    );
  }

  // Menu button.
  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={open}
      aria-label="Menu"
      className={`p-2.5 ${shadow}`}
      style={{ ...surface, borderRadius: layout.rounding }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
      </svg>
    </button>
  );

  const sidePanel = open && !phone && (
    <div
      className={`${place} inset-y-0 z-50 flex w-[300px] max-w-[85%] flex-col overflow-y-auto p-4 ${shadow}`}
      style={{ ...surface, [side]: 0 }}
    >
      <div className={`flex ${side === "left" ? "justify-start" : "justify-end"}`}>
        {closeButton}
      </div>
      <nav className="mt-4">{list(layout.textSize, false)}</nav>
    </div>
  );

  return (
    <>
      <div className={`${place} z-40`} style={anchor}>
        {button}
      </div>
      {sidePanel}
      {fullScreen}
    </>
  );
}

function MenuEntry({
  item,
  current,
  highlight,
  rounding,
  size,
  onChoose,
}: {
  item: MenuViewItem;
  current: boolean;
  highlight: string;
  rounding: number;
  size: number;
  onChoose: () => void;
}) {
  const className = "block truncate px-3 py-1.5 text-left hover:opacity-70";
  const style: CSSProperties = {
    fontSize: size,
    borderRadius: Math.min(rounding, 12),
    backgroundColor: current ? highlight : undefined,
  };
  const label: ReactNode = item.title;
  if (item.href) {
    return (
      <Link href={item.href} onClick={onChoose} className={className} style={style}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onChoose} className={`w-full ${className}`} style={style}>
      {label}
    </button>
  );
}
