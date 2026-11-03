"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ExhibitionRow } from "@/lib/actions/exhibitions";
import type { ExhibitionsSettings, PageTextStyle } from "@/lib/pageStyleLayout";
import { SITE_PHONE_QUERY } from "@/lib/siteBreakpoint";
import { formatDate } from "@/lib/formatDate";
import FadeImage from "@/components/FadeImage";
import { bodyTextCss } from "@/components/textStyleCss";

// Exhibitions on a page (2026-11-02, the ISYT sites' exhibitions pages —
// see ExhibitionsSettings in lib/pageStyleLayout.ts): the list of
// exhibitions, a line, and the chosen one — the first to start with —
// with its venue's address, website, phone and email (2026-11-02, from
// its Location), those it has. On a phone (2026-11-03) tapping one opens
// it over the list, full screen, with ✕ to go back.

// The year it starts (or ends) in.
function yearOf(e: ExhibitionRow): string {
  return (e.startDate ?? e.endDate ?? "").slice(0, 4);
}

// "03/05/2024 to 15/06/2024", either end alone, or nothing.
function datesLine(e: ExhibitionRow): string {
  return [e.startDate, e.endDate].filter((d): d is string => !!d).map(formatDate).join(" to ");
}

export default function ExhibitionsBlock({
  exhibitions,
  settings,
  textStyle,
  contentWidth,
}: {
  // As the catalogue lists them: earliest first.
  exhibitions: ExhibitionRow[];
  settings: ExhibitionsSettings;
  textStyle: PageTextStyle;
  contentWidth: number;
}) {
  const list = settings.newestFirst ? [...exhibitions].reverse() : exhibitions;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = list.find((e) => e.id === chosenId) ?? list[0];
  // On a phone (2026-11-03, Craig's request) the chosen one opens over the
  // list.
  const [phoneOpen, setPhoneOpen] = useState(false);
  const text = bodyTextCss(textStyle, contentWidth);

  const choose = (id: string) => {
    setChosenId(id);
    if (window.matchMedia(SITE_PHONE_QUERY).matches) setPhoneOpen(true);
  };

  const picture = chosen.images[0];
  const heading = [chosen.name, chosen.venue?.name].filter(Boolean).join(" - ");
  const dates = datesLine(chosen);
  const venue = chosen.venue;

  // The chosen exhibition's picture and words — beside the list on a
  // desktop, over it on a phone.
  const detailBody = (
    <>
      {picture && (
        <FadeImage
          key={picture.id}
          src={picture.kind === "VIDEO" ? (picture.posterUrl ?? "") : picture.displayUrl}
          alt={chosen.name}
          className="block h-auto max-h-[70vh] w-auto max-w-full shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
        />
      )}
      {heading && (
        <h2 className="font-bold leading-tight" style={{ color: settings.accent, fontSize: settings.titleSize }}>
          {heading}
        </h2>
      )}
      {dates && <p className="font-bold opacity-80">{dates}</p>}
      {chosen.openingTimes && <p className="whitespace-pre-line">{chosen.openingTimes}</p>}
      {venue && (venue.address || venue.websiteUrl || venue.phone || venue.email) && (
        <div className="flex flex-col">
          {venue.address && <p className="whitespace-pre-line">{venue.address}</p>}
          {venue.websiteUrl && (
            <a href={venue.websiteUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70">
              {venue.websiteName || venue.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
          {venue.phone && <p>{venue.phone}</p>}
          {venue.email && (
            <a href={`mailto:${venue.email}`} className="underline hover:opacity-70">
              {venue.email}
            </a>
          )}
        </div>
      )}
      {chosen.description && <p className="whitespace-pre-line break-words">{chosen.description}</p>}
    </>
  );

  return (
    <div
      className="flex flex-col gap-6 site:grid site:items-stretch site:gap-y-0 site:[column-gap:var(--ex-gap)] site:[grid-template-columns:var(--ex-columns)]"
      style={
        {
          ...text,
          "--ex-gap": `${settings.gap}px`,
          "--ex-columns": `${settings.listShare}% auto minmax(0, 1fr)`,
        } as CSSProperties
      }
    >
      <ul className="flex min-w-0 flex-col gap-1">
        {list.map((e) => {
          const year = yearOf(e);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => choose(e.id)}
                aria-pressed={e.id === chosen.id}
                className="flex w-full items-start gap-4 text-left hover:opacity-80"
                style={{ backgroundColor: e.id === chosen.id ? settings.highlight : undefined }}
              >
                <span
                  className="block shrink-0 overflow-hidden bg-neutral-100"
                  style={{ width: settings.thumbSize, height: settings.thumbSize }}
                >
                  {e.images[0] && (
                    <FadeImage
                      src={e.images[0].kind === "VIDEO" ? (e.images[0].posterUrl ?? "") : e.images[0].url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col pt-1 leading-snug">
                  {e.name && <span className="truncate">{e.name}</span>}
                  {e.venue && <span className="truncate">{e.venue.name}</span>}
                  {year && (
                    <span className="text-[0.85em]" style={{ color: settings.accent }}>
                      {year}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div
        aria-hidden
        className="hidden site:block"
        style={settings.line ? { borderLeft: `${settings.line.thickness}px solid ${settings.line.colour}` } : undefined}
      />

      {/* Kept in view on a desktop (`stickyDetail`), under a sticky Page
          heading (--sticky-top, set by the page), scrolling on its own if
          taller than the window. On a phone it opens over the list. */}
      <div
        className={`hidden min-w-0 flex-col gap-4 site:flex ${
          settings.stickyDetail
            ? "site:sticky site:top-[calc(var(--sticky-top,0px)+16px)] site:max-h-[calc(100dvh-var(--sticky-top,0px)-32px)] site:self-start site:overflow-y-auto"
            : ""
        }`}
      >
        {detailBody}
      </div>

      {phoneOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto bg-white site:hidden" style={text}>
            <div className="sticky top-0 flex justify-end bg-white/90 p-2">
              <button type="button" onClick={() => setPhoneOpen(false)} aria-label="Close" className="p-2 opacity-70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col gap-4 px-5 pb-10">{detailBody}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
