"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import type { PageTextStyle, ShowcaseSettings } from "@/lib/pageStyleLayout";
import type { SiteWork } from "@/lib/siteWorks";
import { useSiteData } from "@/lib/siteData";
import { isSold } from "@/lib/artworkFilters";
import { bodyTextCss } from "@/components/textStyleCss";
import { PAGE_BACKGROUND_CLASS, pageBackgroundStyle } from "@/components/pageMargins";

// A Showcase on a page (2026-11-02, the ISYT sites' showcase pages — see
// ShowcaseSettings in lib/pageStyleLayout.ts): every work the site shows
// (siteData.listSiteWorks), shuffled once each visit and paired in that
// order (with an odd number the last pairs with the first). Each side is
// a door: the front pair sits over the next one, in the page's own
// background so the next doesn't show through, and slides off its side
// (left / right; up / down on a phone, where the pair is stacked) to
// reveal it, as Sliding doors do. The line between the pair stays put.
// The five dots above are only decoration: the middle one flashes once
// each time the pair changes. Each work's words come from its
// presentation in the curation it's shown in, which a click opens.

// The dots: their sizes, the space between them and below them.
const DOT = 6;
const MIDDLE_DOT = 12;
const DOT_GAP = 19;
const DOTS_BELOW = 30;

// A copy in a random order (Fisher–Yates).
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const keyOf = (w: SiteWork) => `${w.curationId}:${w.artworkId}`;

export default function ShowcaseBlock({
  settings,
  textStyle,
  contentWidth,
  background,
  onOpen,
}: {
  settings: ShowcaseSettings;
  textStyle: PageTextStyle;
  contentWidth: number;
  // The page's background on a desktop and on a phone (null = white).
  background: { desktop: string | null; phone: string | null };
  onOpen: (artworkId: string, curationId: string) => void;
}) {
  const siteData = useSiteData();
  // Null until loaded and shuffled — shuffled in the browser only, so the
  // page as first drawn never differs from the server's.
  const [works, setWorks] = useState<SiteWork[] | null>(null);
  const [details, setDetails] = useState<Map<string, CurationWorkPresentation>>(new Map());
  const [index, setIndex] = useState(0);
  const [opening, setOpening] = useState(false);
  const middleDot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let current = true;
    siteData.listSiteWorks().then((all) => {
      if (!current) return;
      setWorks(shuffled(all));
      setIndex(0);
      setOpening(false);
    });
    return () => {
      current = false;
    };
  }, [siteData]);

  const pairs = useMemo(() => {
    if (!works || works.length === 0) return [];
    if (works.length === 1) return [[works[0]]];
    const out: SiteWork[][] = [];
    for (let i = 0; i < works.length; i += 2) out.push([works[i], works[i + 1] ?? works[0]]);
    return out;
  }, [works]);

  // Waits `duration`, then opens; once open (`speed` later), the next
  // pair becomes the front pair, closed again, and the wait restarts.
  useEffect(() => {
    if (pairs.length < 2) return;
    const timer = setTimeout(
      () => {
        if (opening) {
          setIndex((i) => (i + 1) % pairs.length);
          setOpening(false);
        } else {
          setOpening(true);
        }
      },
      (opening ? settings.speed : settings.duration) * 1000,
    );
    return () => clearTimeout(timer);
  }, [opening, index, pairs.length, settings.duration, settings.speed]);

  // The middle dot flashes as each pair slides away to the next.
  useEffect(() => {
    if (!opening) return;
    middleDot.current?.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], {
      duration: settings.speed * 1000,
      easing: "ease-in-out",
    });
  }, [opening, index, settings.speed]);

  const current = useMemo(() => pairs[index] ?? [], [pairs, index]);
  const next = useMemo(() => (pairs.length > 1 ? pairs[(index + 1) % pairs.length] : []), [pairs, index]);

  // The words of the pair showing and the next one, each asked for once.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const wanted = [...current, ...next].filter((w) => !asked.current.has(keyOf(w)));
    if (wanted.length === 0) return;
    for (const w of wanted) asked.current.add(keyOf(w));
    Promise.all(wanted.map((w) => siteData.getPresentation(w.curationId, w.artworkId))).then((found) => {
      setDetails((old) => {
        const map = new Map(old);
        found.forEach((p, i) => {
          if (p) map.set(keyOf(wanted[i]), p);
        });
        return map;
      });
    });
  }, [siteData, current, next]);

  if (pairs.length === 0) return null;

  const text = bodyTextCss(textStyle, contentWidth);
  const frontBackground = pageBackgroundStyle(
    background.desktop ?? "#ffffff",
    background.phone ?? background.desktop ?? "#ffffff",
  );

  const door = (side: 0 | 1) => {
    const front = current[side];
    if (!front) return null;
    const behind = next[side];
    const away = opening ? (side === 0 ? "-100%" : "100%") : "0%";
    return (
      <div className="grid min-w-0 overflow-hidden">
        {behind && (
          <div className="col-start-1 row-start-1 min-w-0" aria-hidden inert>
            <ShowcaseWork work={behind} data={details.get(keyOf(behind))} settings={settings} />
          </div>
        )}
        {/* Keyed by pair, so each new front pair starts closed with no
            animation. */}
        <div
          key={index}
          className={`relative col-start-1 row-start-1 min-w-0 [transform:translateY(var(--sc-away))] site:[transform:translateX(var(--sc-away))] ${PAGE_BACKGROUND_CLASS}`}
          style={
            {
              ...frontBackground,
              "--sc-away": away,
              transition: opening ? `transform ${settings.speed}s ease-in-out` : "none",
            } as CSSProperties
          }
        >
          <ShowcaseWork
            work={front}
            data={details.get(keyOf(front))}
            settings={settings}
            onOpen={() => onOpen(front.artworkId, front.curationId)}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={text}>
      <div className="flex items-center justify-center" style={{ gap: DOT_GAP, marginBottom: DOTS_BELOW }} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            ref={i === 2 ? middleDot : undefined}
            className="rounded-full"
            style={{
              width: i === 2 ? MIDDLE_DOT : DOT,
              height: i === 2 ? MIDDLE_DOT : DOT,
              background: settings.accent,
            }}
          />
        ))}
      </div>

      <div
        className="flex flex-col gap-[var(--sc-gap)] site:grid site:gap-y-0 site:[column-gap:var(--sc-gap)] site:[grid-template-columns:minmax(0,1fr)_auto_minmax(0,1fr)]"
        style={
          {
            "--sc-gap": `${settings.gap}px`,
            "--sc-hd": `${settings.height.desktop}px`,
            "--sc-hp": `${settings.height.phone}px`,
          } as CSSProperties
        }
      >
        {door(0)}
        {current.length > 1 && (
          <>
            {/* The line: across between the stacked pair on a phone,
                down between them on a desktop. */}
            <div
              aria-hidden
              className={
                settings.line
                  ? "border-t-[length:var(--sc-line)] site:border-l-[length:var(--sc-line)] site:border-t-0"
                  : "hidden site:block"
              }
              style={
                settings.line
                  ? ({ "--sc-line": `${settings.line.thickness}px`, borderColor: settings.line.colour } as CSSProperties)
                  : undefined
              }
            />
            {door(1)}
          </>
        )}
      </div>
    </div>
  );
}

// One work: its picture, whole, in a box of the set height, then its
// title and details — the description, the edition and type, medium,
// size, and Sold for a sold work.
function ShowcaseWork({
  work,
  data,
  settings,
  onOpen,
}: {
  work: SiteWork;
  data: CurationWorkPresentation | undefined;
  settings: ShowcaseSettings;
  onOpen?: () => void;
}) {
  const url = work.displayUrl ?? work.imageUrl;
  const title = data?.catalogueName ?? work.catalogueName;
  const details = data
    ? [
        [data.edition, data.type].filter(Boolean).join(" - "),
        data.medium ?? "",
        data.size ?? "",
        isSold(work.availability) ? "Sold" : "",
      ].filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        title={title}
        className="mb-2 block h-[var(--sc-hp)] w-full site:h-[var(--sc-hd)]"
      >
        {url && <img src={url} alt={title} className="h-full w-full object-contain object-left-top" />}
      </button>
      <h3 className="leading-snug" style={{ color: settings.accent, fontSize: settings.titleSize }}>
        {title}
      </h3>
      {data?.description && <p className="whitespace-pre-line break-words">{data.description}</p>}
      {details.length > 0 && (
        <p>
          {details.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
