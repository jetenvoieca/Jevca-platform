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

    const seekToFirstFrame = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        // Some browsers can briefly disallow seeking immediately on
        // metadata load — harmless to skip, worst case it stays black.
      }
    };

    // iOS Safari fix (2026-09-12, direct report — "videos don't show a
    // still on iPad, desktop's fine"). The plain currentTime seek above
    // is enough on desktop browsers, which will decode and paint
    // whatever frame is seeked to as soon as metadata is available. iOS
    // Safari won't reliably do that for a video that's never actually
    // been played — seeking alone can silently leave the canvas black.
    // Briefly playing and immediately pausing forces it to actually
    // decode and paint a real frame; muted + playsInline (both already
    // set below) is exactly what lets this run without a tap. Runs
    // everywhere, not just iOS, since it's harmless wherever the seek
    // alone already worked, and falls back to the plain seek if the
    // browser blocks the autoplay for some other reason.
    const showFirstFrame = () => {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        playAttempt.then(() => video.pause()).catch(seekToFirstFrame);
      } else {
        seekToFirstFrame();
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
