"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useSiteData } from "@/lib/siteData";

// The presentation description of one work in a curation (2026-11-02):
// a Text holding "Work's description" — on the page, and in Arrange — for
// the work the page's picture shows (see showingWorkId in
// lib/pageComponents.ts). Nothing while it loads or if the work has no
// description, unless `empty` is given to show then.
export default function WorkDescriptionText({
  curationId,
  artworkId,
  style,
  empty = null,
}: {
  curationId: string;
  artworkId: string;
  style?: CSSProperties;
  empty?: string | null;
}) {
  const siteData = useSiteData();
  const [loaded, setLoaded] = useState<{ key: string; text: string } | null>(null);
  const key = `${curationId}:${artworkId}`;

  useEffect(() => {
    let current = true;
    siteData.getPresentation(curationId, artworkId).then((p) => {
      if (current) setLoaded({ key, text: p?.description?.trim() ?? "" });
    });
    return () => {
      current = false;
    };
  }, [siteData, curationId, artworkId, key]);

  if (!loaded || loaded.key !== key) return null;
  if (!loaded.text) return empty ? <p className="text-sm text-neutral-400">{empty}</p> : null;
  return (
    <p className="whitespace-pre-line break-words text-sm text-neutral-800" style={style}>
      {loaded.text}
    </p>
  );
}
