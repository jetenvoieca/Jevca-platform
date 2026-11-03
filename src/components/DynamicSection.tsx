"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { DynamicItem, DynamicMedia, DynamicSection } from "@/lib/dynamicPresentation";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";

// One section of a Dynamic presentation (2026-11-03 — see
// lib/dynamicPresentation.ts), drawn the same in its editor and on the
// site: a box of its shape — its colour, with its picture (cover) or
// looping, silent video over it — holding its items where they were
// placed. It measures itself (a container), so text sized as a % of its
// width scales with it. `renderItem` wraps each item (the editor's
// dragging, the site's clicking); `children` go on top (the editor's
// outline).

// A work of the curation, as an item shows it — the works come from the
// curation, given by whoever draws the presentation.
export type DynamicWork = { url: string | null; name: string };
export const DynamicWorksContext = createContext<Map<string, DynamicWork>>(new Map());

export function DynamicSectionBox({
  section,
  media,
  renderItem,
  children,
}: {
  section: DynamicSection;
  media: DynamicMedia;
  renderItem: (item: DynamicItem, content: ReactNode, style: CSSProperties) => ReactNode;
  children?: ReactNode;
}) {
  const background = section.backgroundImageId ? media[section.backgroundImageId] : undefined;
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `100 / ${section.height}`, background: section.colour, containerType: "inline-size" }}
    >
      {background?.kind === "VIDEO" ? (
        <video
          src={background.url}
          poster={background.posterUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        background && (
          <img src={background.url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        )
      )}
      {section.items.map((item) => (
        <ItemSlot key={item.id} item={item} media={media} renderItem={renderItem} />
      ))}
      {children}
    </div>
  );
}

// Where an item sits, and what it shows.
function ItemSlot({
  item,
  media,
  renderItem,
}: {
  item: DynamicItem;
  media: DynamicMedia;
  renderItem: (item: DynamicItem, content: ReactNode, style: CSSProperties) => ReactNode;
}) {
  const style: CSSProperties = { position: "absolute", left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%` };
  return <>{renderItem(item, <DynamicItemContent item={item} media={media} />, style)}</>;
}

function DynamicItemContent({ item, media }: { item: DynamicItem; media: DynamicMedia }) {
  const works = useContext(DynamicWorksContext);
  if (item.kind === "text") {
    return (
      <p
        className="whitespace-pre-line break-words leading-tight"
        style={{
          fontFamily: SITE_FONT_FAMILY[item.font],
          fontSize: `${item.size}cqw`,
          color: item.colour,
          fontWeight: item.bold ? 700 : 400,
        }}
      >
        {item.text || " "}
      </p>
    );
  }
  const url = item.kind === "work" ? (works.get(item.artworkId ?? "")?.url ?? null) : (media[item.imageId ?? ""]?.url ?? null);
  const name = item.kind === "work" ? (works.get(item.artworkId ?? "")?.name ?? "") : "";
  const video = item.kind === "media" && media[item.imageId ?? ""]?.kind === "VIDEO";
  if (!url) return <div className="aspect-square w-full bg-black/10" />;
  return video ? (
    <video src={url} autoPlay muted loop playsInline className="pointer-events-none block w-full" />
  ) : (
    <img src={url} alt={name} draggable={false} className="pointer-events-none block w-full select-none" />
  );
}
