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
//
// `at` (2026-10-17, Video Edit's neighbouring clips): show the frame at
// that many seconds instead of the first.
export default function VideoThumb({ src, className, at = 0.1 }: { src: string; className?: string; at?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const seekToFirstFrame = () => {
      try {
        video.currentTime = at;
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
        playAttempt
          .then(() => {
            video.pause();
            seekToFirstFrame();
          })
          .catch(seekToFirstFrame);
      } else {
        seekToFirstFrame();
      }
    };

    // Since files come straight from storage (2026-10-16) they can arrive
    // before this runs — then the event has already happened, so the
    // frame is shown now rather than waiting for an event that won't come.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      showFirstFrame();
      return;
    }
    video.addEventListener("loadedmetadata", showFirstFrame);
    return () => video.removeEventListener("loadedmetadata", showFirstFrame);
  }, [at]);

  return <video ref={videoRef} src={src} muted playsInline preload="metadata" className={className} />;
}
