"use client";

import { useEffect, useRef } from "react";

// Videos uploaded through the browser get a real poster image (a canvas
// grabs a frame at upload time — see uploadDirect.ts). Videos uploaded
// via the iPhone Shortcut never touch a browser at upload time, so they
// have no posterUrl at all. Rather than generating and storing a real
// poster after the fact (a bigger job — capturing a frame, uploading it,
// updating the record), this shows the video's own first frame directly:
// a browser will render it black by default, so a tiny nudge to
// currentTime once metadata loads is enough to make the real first frame
// visible, with no server round-trip.
export default function VideoThumb({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const showFirstFrame = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        // Some browsers can briefly disallow seeking immediately on
        // metadata load — harmless to skip, worst case it stays black.
      }
    };
    video.addEventListener("loadedmetadata", showFirstFrame);
    return () => video.removeEventListener("loadedmetadata", showFirstFrame);
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="metadata"
      className={className}
    />
  );
}
