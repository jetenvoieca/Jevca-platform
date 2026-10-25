"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { SUB_PAGE_SCALE, menuBackground, menuHeight, menuSide, type MenuStyleLayout } from "@/lib/menuStyleLayout";
import { mergeTextStyle } from "@/lib/textStyle";
import { SITE_DESKTOP_MIN } from "@/lib/siteBreakpoint";
import { bodyTextCss } from "@/components/textStyleCss";
import SiteLogo from "@/components/SiteLogo";

// One menu entry — a Live Page. With `href` it's a link (the published
// site shows the page without leaving — see PublishedSite); without (the
// Menus page preview) choosing it only shows what would happen.
// `children` (2026-10-25): the pages sitting under it.
export type MenuViewItem = { id: string; title: string; href?: string; children?: MenuViewItem[] };

// What a menu shows of the artist (2026-10-23): the Logo and the words
// under it, for a top bar, and their Instagram and Facebook links, for
// under a Side list. Absent in the Menus page preview, which shows
// stand-ins.
export type MenuArtist = {
  logoUrl: string | null;
  logoByline: string | null;
  social: { instagramUrl: string | null; facebookUrl: string | null } | null;
};

const SHADOW_CLASS = { none: "", soft: "shadow-md", strong: "shadow-2xl" } as const;

// Space between the button / tab and the screen's edges, in pixels.
const EDGE = 16;

// The attribute a site's pages carry so a menu can make room for itself
// (see PublishedSite): below its top bar and beside its Side list.
export const SITE_PAGE_ATTRIBUTE = "data-site-page";

// A site's menu, drawn in its Menu Style (2026-10-06) — see
// lib/menuStyleLayout.ts. The items are the site's Live Pages.
// - Menu button: opens the list in a panel down the button's side of
//   the screen.
// - Side tab: a tab on the screen's edge that slides the list out when
//   hovered or tapped.
// - Side list (2026-10-23): the list down one side, always shown and
//   staying in place; narrower than its `hamburgerBelow` it becomes a
//   menu button that opens it full screen.
// - Top bar (2026-10-23): the artist's Logo across the top, any kind.
// - `phone`: every kind opens full screen.
// - Floating closes the menu once a page is chosen; Fixed leaves it
//   open (a Fixed tab also stays open when the pointer leaves it).
// On the site, the room the top bar and Side list take is kept clear of
// the pages, and which of the Side list or its button shows is decided
// by the window's width, both by the CSS written here (so nothing jumps
// when the page first appears). `contained` places it within the
// nearest positioned box instead of the screen — the Menus page
// preview's desktop and phone frames, where `phone` decides.
export default function MenuView({
  layout,
  items,
  currentId,
  phone,
  artist,
  contained = false,
  defaultOpen = false,
}: {
  layout: MenuStyleLayout;
  items: MenuViewItem[];
  currentId: string | null;
  phone: boolean;
  artist?: MenuArtist | null;
  contained?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const scope = `menu-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const sideList = layout.kind === "sidelist";
  const side = sideList ? layout.list.side : menuSide(layout.position);
  const height = menuHeight(layout.position);
  const place = contained ? "absolute" : "fixed";
  const floating = layout.behaviour === "floating";
  const bar = layout.topBar;
  const device = phone ? "phone" : "desktop";
  const textColour = layout.text.colour ?? undefined;

  const surface: CSSProperties = {
    backgroundColor: menuBackground(layout),
    color: textColour,
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

  // A Side list's pages keep their size full screen; the other kinds'
  // grow, as they always have. Pages under another (2026-10-25) show
  // under it, indented, in their own look — while one of that group's
  // pages is showing, or always.
  const list = (fullScreen: boolean) => {
    const size = (layout.text.size ?? 15) * (fullScreen && !sideList ? 1.4 : 1);
    const align = fullScreen ? "center" : sideList ? layout.list.align : "left";
    const sub = layout.sub;
    const subText = mergeTextStyle(layout.text, sub.text);
    const subSize = sub.text.size !== null ? sub.text.size : size * SUB_PAGE_SCALE;
    const open = (item: MenuViewItem) =>
      sub.show === "always" || item.id === currentId || !!item.children?.some((c) => c.id === currentId);
    return (
      <ul className={`flex flex-col ${ALIGN_ITEMS[align]}`} style={{ gap: sideList ? layout.list.gap : 4 }}>
        {items.map((item) => (
          <li key={item.id} className="max-w-full">
            <MenuEntry
              item={item}
              current={item.id === currentId}
              layout={layout}
              text={layout.text}
              size={size}
              align={align}
              onChoose={choose}
            />
            {!!item.children?.length && open(item) && (
              <ul
                className={`flex flex-col ${ALIGN_ITEMS[align]}`}
                style={{ gap: sub.gap, marginTop: sub.gap, paddingLeft: align === "left" ? sub.indent : 0 }}
              >
                {item.children.map((child) => (
                  <li key={child.id} className="max-w-full">
                    <MenuEntry
                      item={child}
                      current={child.id === currentId}
                      layout={layout}
                      text={subText}
                      size={subSize}
                      align={align}
                      onChoose={choose}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const social = sideList && layout.list.social && <SocialLinks look={layout.list.social} artist={artist} />;

  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close menu"
      className="p-2 opacity-70 hover:opacity-100"
      style={{ color: textColour }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );

  // Full screen: on phones, whichever kind, and a Side list's button.
  // A Side list's is hidden again if the window grows wide enough for
  // the list.
  const fullScreen = open && (phone || sideList) && (
    <div
      className={`${place} inset-0 z-50 flex flex-col overflow-y-auto p-4 ${
        sideList ? narrowClass(scope, contained, phone) : ""
      }`}
      style={surface}
    >
      <div className={`flex ${side === "left" ? "justify-start" : "justify-end"}`}>{closeButton}</div>
      <nav className="flex flex-1 flex-col items-center justify-center gap-10 py-6">
        {list(true)}
        {social}
      </nav>
    </div>
  );

  const menuButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={open}
      aria-label="Menu"
      className={`p-2.5 ${sideList ? "" : shadow}`}
      style={sideList ? { color: textColour } : { ...surface, borderRadius: layout.rounding }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
      </svg>
    </button>
  );

  const topBar = bar && (
    <header
      className={`${place} inset-x-0 top-0 z-40 flex items-center justify-between ${
        contained
          ? ""
          : "h-[var(--bar-h-phone)] px-[var(--bar-pad-phone)] site:h-[var(--bar-h)] site:px-[var(--bar-pad)]"
      }`}
      style={
        {
          ...surface,
          "--bar-h": `${bar.height.desktop}px`,
          "--bar-h-phone": `${bar.height.phone}px`,
          "--bar-pad": `${bar.padding.desktop}px`,
          "--bar-pad-phone": `${bar.padding.phone}px`,
          ...(contained && { height: bar.height[device], paddingInline: bar.padding[device] }),
          borderBottom: bar.line ? `${bar.line.thickness}px solid ${bar.line.colour}` : undefined,
          flexDirection: side === "left" ? "row-reverse" : "row",
        } as CSSProperties
      }
    >
      {artist?.logoUrl ? (
        <SiteLogo
          logoUrl={artist.logoUrl}
          bylineText={artist.logoByline}
          byline={bar.byline}
          height={bar.logoHeight}
          href={items[0]?.href}
          device={contained ? device : undefined}
        />
      ) : (
        <div
          className="flex aspect-[3/1] items-center justify-center rounded bg-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400"
          style={{ height: bar.logoHeight[device] }}
        >
          Logo
        </div>
      )}
      {sideList && <div className={narrowClass(scope, contained, phone)}>{menuButton}</div>}
    </header>
  );

  // The CSS that keeps the pages clear of the top bar and Side list,
  // and shows the Side list or its button by the window's width.
  const css = !contained && <style>{menuCss(layout, scope)}</style>;

  if (sideList) {
    const barHeight = bar ? (contained ? bar.height[device] : bar.height.desktop) : 0;
    return (
      <>
        {css}
        {topBar}
        <nav
          className={`${place} bottom-0 z-30 flex flex-col overflow-y-auto ${wideClass(scope, contained, phone)}`}
          style={{
            ...surface,
            top: barHeight,
            [side]: 0,
            width: layout.list.width,
            [side === "right" ? "borderLeft" : "borderRight"]: layout.list.line
              ? `${layout.list.line.thickness}px solid ${layout.list.line.colour}`
              : undefined,
            paddingTop: layout.list.top,
            paddingBottom: layout.list.top,
            gap: layout.list.gap,
          }}
        >
          {list(false)}
          {social && <div className={`flex ${JUSTIFY[layout.list.align]} px-3`}>{social}</div>}
        </nav>
        {!bar && (
          <div className={`${place} z-40 ${narrowClass(scope, contained, phone)}`} style={anchor}>
            {menuButton}
          </div>
        )}
        {fullScreen}
      </>
    );
  }

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
          {css}
          {topBar}
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
        <div className="w-[240px] p-3">{list(false)}</div>
      </div>
    );

    return (
      <>
        {css}
        {topBar}
        <nav
          className={`${place} z-40 flex items-center ${side === "left" ? "flex-row-reverse" : ""}`}
          style={anchor}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => floating && setOpen(false)}
        >
          {tab}
          {panel}
        </nav>
      </>
    );
  }

  // Menu button.
  const sidePanel = open && !phone && (
    <div
      className={`${place} inset-y-0 z-50 flex w-[300px] max-w-[85%] flex-col overflow-y-auto p-4 ${shadow}`}
      style={{ ...surface, [side]: 0 }}
    >
      <div className={`flex ${side === "left" ? "justify-start" : "justify-end"}`}>{closeButton}</div>
      <nav className="mt-4">{list(false)}</nav>
    </div>
  );

  return (
    <>
      {css}
      {topBar}
      <div className={`${place} z-40`} style={anchor}>
        {menuButton}
      </div>
      {sidePanel}
      {fullScreen}
    </>
  );
}

const ALIGN_ITEMS = { left: "items-start", center: "items-center", right: "items-end" } as const;
const JUSTIFY = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;
const TEXT_ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

// A Side list shows when the window is wide enough, its button when not
// (the CSS in menuCss). In a preview frame, the desktop frame shows the
// list and the phone frame the button.
function wideClass(scope: string, contained: boolean, phone: boolean): string {
  if (contained) return phone ? "hidden" : "";
  return `${scope}-wide`;
}

function narrowClass(scope: string, contained: boolean, phone: boolean): string {
  if (contained) return phone ? "" : "hidden";
  return `${scope}-narrow`;
}

// The site's CSS for this menu: room for the top bar (its phone height
// below 700px) and, from the Side list's width up, room for the list on
// its side, the list shown and its button hidden.
function menuCss(layout: MenuStyleLayout, scope: string): string {
  const page = `[${SITE_PAGE_ATTRIBUTE}]`;
  const rules: string[] = [];
  if (layout.topBar) {
    rules.push(`${page}{padding-top:${layout.topBar.height.phone}px}`);
    rules.push(`@media (min-width:${SITE_DESKTOP_MIN}px){${page}{padding-top:${layout.topBar.height.desktop}px}}`);
  }
  if (layout.kind === "sidelist") {
    const { side, width, hamburgerBelow } = layout.list;
    rules.push(`.${scope}-wide{display:none}`);
    rules.push(
      `@media (min-width:${hamburgerBelow}px){.${scope}-wide{display:flex}.${scope}-narrow{display:none}${page}{padding-${side}:${width}px}}`,
    );
  }
  return rules.join("");
}

// The artist's Instagram and Facebook links, in their look — stand-ins
// in the Menus page preview. Either is left out when not set.
function SocialLinks({
  look,
  artist,
}: {
  look: NonNullable<MenuStyleLayout["list"]["social"]>;
  artist: MenuArtist | null | undefined;
}) {
  const links = artist
    ? [
        { label: "Instagram", href: artist.social?.instagramUrl ?? null },
        { label: "Facebook", href: artist.social?.facebookUrl ?? null },
      ].filter((l) => l.href)
    : [
        { label: "Instagram", href: null },
        { label: "Facebook", href: null },
      ];
  if (links.length === 0) return null;
  const style: CSSProperties = { ...bodyTextCss(look.text), textTransform: look.capitals ? "uppercase" : undefined };
  return (
    <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
      {links.map((l) =>
        l.href ? (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70"
            style={style}
          >
            {l.label}
          </a>
        ) : (
          <span key={l.label} style={style}>
            {l.label}
          </span>
        ),
      )}
    </div>
  );
}

function MenuEntry({
  item,
  current,
  layout,
  text,
  size,
  align,
  onChoose,
}: {
  item: MenuViewItem;
  current: boolean;
  layout: MenuStyleLayout;
  text: MenuStyleLayout["text"];
  size: number;
  align: "left" | "center" | "right";
  onChoose: () => void;
}) {
  const className = `block truncate px-3 py-1.5 hover:opacity-70 ${TEXT_ALIGN[align]}`;
  const style: CSSProperties = {
    ...bodyTextCss(text),
    fontSize: size,
    borderRadius: Math.min(layout.rounding, 12),
    backgroundColor: current && layout.highlightColor ? layout.highlightColor : undefined,
  };
  const label: ReactNode = item.title;
  if (item.href) {
    return (
      <a href={item.href} onClick={onChoose} className={className} style={style}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onChoose} className={`w-full ${className}`} style={style}>
      {label}
    </button>
  );
}
