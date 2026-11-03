"use client";

import { useRef, useState, type CSSProperties } from "react";
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
// its Location), those it has. On
// a phone the chosen one shows above the list, scrolled to when chosen.

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
  const detailRef = useRef<HTMLDivElement>(null);
  const text = bodyTextCss(textStyle, contentWidth);

  const choose = (id: string) => {
    setChosenId(id);
    if (window.matchMedia(SITE_PHONE_QUERY).matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const picture = chosen.images[0];
  const heading = [chosen.name, chosen.venue?.name].filter(Boolean).join(" - ");
  const dates = datesLine(chosen);
  const venue = chosen.venue;

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
      <ul className="order-2 flex min-w-0 flex-col gap-1 site:order-none">
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
          taller than the window. */}
      <div
        ref={detailRef}
        className={`order-1 flex min-w-0 scroll-mt-4 flex-col gap-4 site:order-none ${
          settings.stickyDetail
            ? "site:sticky site:top-[calc(var(--sticky-top,0px)+16px)] site:max-h-[calc(100dvh-var(--sticky-top,0px)-32px)] site:self-start site:overflow-y-auto"
            : ""
        }`}
      >
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
      </div>
    </div>
  );
}
