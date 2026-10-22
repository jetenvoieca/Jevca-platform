"use client";

// A picture made ready to sit on any background (2026-10-17 for
// stickers; shared with the Logo 2026-10-22): its white background made
// see-through if it's on one (removeWhiteBackground), and its
// see-through edges trimmed off, so a signature on a big empty canvas
// becomes just the signature. The result is a PNG; a PNG or a drawing
// (SVG) with nothing to change goes up as it is. Runs in the browser.

const SEE_THROUGH = 8; // alpha at or below this counts as empty

// Makes a picture's white background see-through (2026-10-17): every
// near-white pixel — including the white inside letters, which on a
// signature is background too — and the soft edge of the drawing blended
// to see-through, so no white fringe shows on a dark video. Only for
// pictures on a white background (edgeIsWhite). False if there was no
// white to take out.
const NEAR_WHITE = 235;

function removeWhiteBackground(data: Uint8ClampedArray, width: number, height: number): boolean {
  const background = new Uint8Array(width * height);
  let found = false;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (data[i] >= NEAR_WHITE && data[i + 1] >= NEAR_WHITE && data[i + 2] >= NEAR_WHITE) {
      background[p] = 1;
      found = true;
    }
  }
  if (!found) return false;
  for (let p = 0; p < width * height; p++) {
    if (background[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    // The edge of the drawing: white taken out of its colour.
    const x = p % width;
    const touchesBackground =
      (x > 0 && background[p - 1]) ||
      (x < width - 1 && background[p + 1]) ||
      (p >= width && background[p - width]) ||
      (p < width * (height - 1) && background[p + width]);
    const i = p * 4;
    // Already see-through (space around the picture) stays as it is.
    if (!touchesBackground || data[i + 3] <= SEE_THROUGH) continue;
    const alpha = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]) / 255;
    if (alpha <= 0) {
      data[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 - (255 - data[i + c]) / alpha);
    data[i + 3] = Math.round(alpha * data[i + 3]);
  }
  return true;
}

type Box = { top: number; left: number; bottom: number; right: number };

// The smallest box holding everything that isn't see-through, or null.
function contentBox(data: Uint8ClampedArray, width: number, height: number): Box | null {
  let top = height,
    left = width,
    bottom = -1,
    right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > SEE_THROUGH) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return bottom < 0 ? null : { top, left, bottom, right };
}

// Whether the edge of the box is (almost all) near-white — counting only
// its pixels that aren't see-through, however soft (a white box may have
// soft or rounded edges).
const WHITE_EDGE_SHARE = 0.9;

function edgeIsWhite(data: Uint8ClampedArray, width: number, box: Box): boolean {
  let white = 0,
    total = 0;
  const check = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] <= SEE_THROUGH) return;
    total++;
    if (data[i] >= NEAR_WHITE && data[i + 1] >= NEAR_WHITE && data[i + 2] >= NEAR_WHITE) white++;
  };
  for (let x = box.left; x <= box.right; x++) {
    check(x, box.top);
    check(x, box.bottom);
  }
  for (let y = box.top + 1; y < box.bottom; y++) {
    check(box.left, y);
    check(box.right, y);
  }
  return total > 0 && white / total >= WHITE_EDGE_SHARE;
}

export async function seeThroughPicture(file: File, options: { svgScale?: number } = {}): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("this browser can't open that picture — save it as a PNG and try again.");
    });
    // A drawing with no size of its own (some SVGs) is made 1000px wide;
    // a drawing (SVG) is drawn `svgScale` times its own size, so it stays
    // sharp once it's a picture.
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const scale = isSvg ? (options.svgScale ?? 1) : 1;
    const width = Math.round((image.naturalWidth || 1000) * scale);
    const height = Math.round((image.naturalHeight || 1000) * scale);
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    const context = full.getContext("2d");
    if (!context) throw new Error("couldn't be read.");
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    const { data } = pixels;
    let box = contentBox(data, width, height);
    if (!box) throw new Error("the picture is completely see-through.");

    // A picture on a white background — its edge all but entirely white,
    // whether or not see-through space surrounds it — has the white made
    // see-through, then is trimmed again.
    const madeSeeThrough = edgeIsWhite(data, width, box) && removeWhiteBackground(data, width, height);
    if (madeSeeThrough) {
      context.putImageData(pixels, 0, 0);
      box = contentBox(data, width, height);
      if (!box) throw new Error("the picture is only white.");
    }
    const { top, left, bottom, right } = box;
    const untrimmed = top === 0 && left === 0 && bottom === height - 1 && right === width - 1;
    const isPng = file.type === "image/png" || (!file.type && /\.png$/i.test(file.name));
    // Nothing to change: a PNG, or a drawing (kept as a drawing), goes up as it is.
    if (untrimmed && (isPng || isSvg) && !madeSeeThrough) return file;

    const trimmed = document.createElement("canvas");
    trimmed.width = right - left + 1;
    trimmed.height = bottom - top + 1;
    trimmed
      .getContext("2d")
      ?.drawImage(full, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    return await new Promise<Blob>((resolve, reject) =>
      trimmed.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("couldn't be made into a PNG."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
