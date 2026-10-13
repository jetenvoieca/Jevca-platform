"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

// A picture that fades in once it has loaded (2026-10-13, Craig's
// choice) instead of popping in — used for the pictures on a site's
// pages. One already loaded (e.g. fetched early, see PublishedSite)
// shows at once. A picture that fails to load is shown as the browser
// shows it, not left invisible.
export default function FadeImage({
  className = "",
  onLoad,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  // The address that has loaded, so a new address fades in again.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const src = typeof props.src === "string" ? props.src : null;

  // Loaded before the page came alive (drawn by the server, or from
  // the browser's cache): no load event will come.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && src) setLoadedSrc(src);
  }, [src]);

  const shown = src !== null && loadedSrc === src;
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      ref={ref}
      {...props}
      onLoad={(e) => {
        setLoadedSrc(src);
        onLoad?.(e);
      }}
      onError={(e) => {
        setLoadedSrc(src);
        onError?.(e);
      }}
      className={`${className} transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
    />
  );
}
