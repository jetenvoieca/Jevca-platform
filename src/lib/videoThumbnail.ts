// Generates a JPEG still frame from a video file, entirely in the browser
// (no ffmpeg or server-side video processing — not realistically available
// on Netlify Functions). Used at upload time so videos get a real
// thumbnail instead of a generic placeholder in the catalogue.
export function generateVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.addEventListener("loadedmetadata", () => {
      // Frame zero of many videos is black/blank — a moment in gives a
      // more representative still.
      const seekTo = video.duration ? Math.min(1, video.duration / 2) : 0;
      video.currentTime = seekTo;
    });

    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Could not create canvas context."));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (blob) resolve(blob);
          else reject(new Error("Could not generate a still frame."));
        },
        "image/jpeg",
        0.85
      );
    });

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Could not read the video to generate a still frame."));
    });
  });
}
