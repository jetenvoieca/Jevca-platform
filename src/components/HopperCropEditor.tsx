"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { cropImage } from "@/lib/actions/imageCrop";

const FULL_CROP: PercentCrop = { unit: "%", x: 0, y: 0, width: 100, height: 100 };
const STRAIGHTEN_LIMIT = 45;

// Crop + rotate for the photo currently being sorted in the Hopper
// (2026-09-24, direct request). Rotation is 90° turns plus a fine
// straightening slider; the crop box is free-shape.
//
// This is only the on-screen editor. It draws the smaller display copy
// (falling back to the original if there isn't one) rotated onto a
// canvas, lets the crop box be drawn over that, and sends the crop as
// percentages plus the total angle to cropImage — which does the real
// work on the full-resolution original, server-side. The canvas is
// never read back (so a cross-origin image source is fine here), and
// the canvas and the server both rotate about the centre into the same
// enlarged bounding box, so the percentages mean the same thing in
// both places.
export default function HopperCropEditor({
  imageId,
  src,
  onCancel,
  onSaved,
}: {
  imageId: string;
  src: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [crop, setCrop] = useState<PercentCrop>(FULL_CROP);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const rotation = quarterTurns * 90 + straighten;

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => setLoadError(true);
    img.src = src;
  }, [src]);

  // Redraw whenever the angle changes. The crop box resets to the full
  // image each time, since the rotated shape (and so what the old box
  // was framing) has changed underneath it — rotate first, then crop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    canvas.width = Math.round(w * cos + h * sin);
    canvas.height = Math.round(w * sin + h * cos);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(image, -w / 2, -h / 2);
    setCrop(FULL_CROP);
  }, [image, rotation]);

  const isUnchanged =
    rotation % 360 === 0 &&
    crop.x <= 0.01 &&
    crop.y <= 0.01 &&
    crop.width >= 99.99 &&
    crop.height >= 99.99;
  const hasCrop = crop.width > 0 && crop.height > 0;

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await cropImage(
        imageId,
        { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
        rotation
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  };

  const handleReset = () => {
    setQuarterTurns(0);
    setStraighten(0);
    setCrop(FULL_CROP);
  };

  if (loadError) {
    return (
      <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
        This image couldn&apos;t be loaded for cropping.{" "}
        <button type="button" onClick={onCancel} className="underline">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="mb-3 flex justify-center rounded-md bg-neutral-50">
        {image ? (
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            keepSelection
            ruleOfThirds
            disabled={isSaving}
          >
            <canvas ref={canvasRef} className="block max-h-[480px] max-w-full" />
          </ReactCrop>
        ) : (
          <p className="py-16 text-sm text-neutral-400">Loading image…</p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setQuarterTurns((q) => q - 1)}
          disabled={isSaving}
          aria-label="Rotate 90° left"
          title="Rotate 90° left"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          ⟲ 90°
        </button>
        <button
          type="button"
          onClick={() => setQuarterTurns((q) => q + 1)}
          disabled={isSaving}
          aria-label="Rotate 90° right"
          title="Rotate 90° right"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          ⟳ 90°
        </button>
        <label className="flex min-w-[220px] flex-1 items-center gap-2 text-sm text-neutral-700">
          Straighten
          <input
            type="range"
            min={-STRAIGHTEN_LIMIT}
            max={STRAIGHTEN_LIMIT}
            step={0.1}
            value={straighten}
            onChange={(e) => setStraighten(parseFloat(e.target.value))}
            disabled={isSaving}
            className="flex-1"
          />
          <span className="w-12 text-right tabular-nums text-neutral-500">
            {straighten.toFixed(1)}°
          </span>
        </label>
        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving}
          className="text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
        >
          Reset
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!image || !hasCrop || isUnchanged || isSaving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save crop"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="text-xs text-neutral-400">Replaces the original photo.</span>
      </div>
    </div>
  );
}
