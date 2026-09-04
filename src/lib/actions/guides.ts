"use server";

import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { getPresignedUploadUrl } from "@/lib/r2";
import { revalidatePath } from "next/cache";

// Step-by-step Guides (2026-09-04) — platform-wide admin documentation,
// shown in the Administration menu. See the Guide model in schema.prisma
// for why `steps` lives as JSON rather than its own table.

export type GuideCategory = "USER" | "TECHNICAL";

export type GuideStep = {
  id: string;
  text: string;
  imageUrl: string | null;
};

export type GuideWithSteps = {
  id: string;
  category: GuideCategory;
  title: string;
  steps: GuideStep[];
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}

// Returns every guide, both categories — the Guides page filters to the
// active tab client-side rather than re-fetching per tab switch, since
// the whole list is small (this is hand-authored documentation, not a
// large dataset).
export async function listGuides(): Promise<GuideWithSteps[]> {
  const rows = await db.guide.findMany({
    orderBy: [{ category: "asc" }, { position: "asc" }],
  });
  return rows.map((r) => ({
    ...r,
    category: r.category as GuideCategory,
    steps: Array.isArray(r.steps) ? (r.steps as unknown as GuideStep[]) : [],
  }));
}

// "+ New Topic" — creates an empty guide (no steps yet) at the end of
// its category, ready to be opened straight into edit mode.
export async function createGuide(
  category: GuideCategory,
  title: string
): Promise<{ guide: GuideWithSteps } | { error: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required." };

  const highest = await db.guide.findFirst({
    where: { category },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const guide = await db.guide.create({
    data: {
      category,
      title: trimmed,
      position: (highest?.position ?? -1) + 1,
      steps: [],
    },
  });

  revalidatePath("/accounts/guides");
  return { guide: { ...guide, category: guide.category as GuideCategory, steps: [] } };
}

// Saves the title and the full ordered steps array in one call — the
// edit panel holds its own working copy while open (drag-reordering,
// adding/removing steps) and only writes it back on an explicit save,
// same "preview only until saved" shape as everything else editable in
// this app.
export async function updateGuide(
  id: string,
  title: string,
  steps: GuideStep[]
): Promise<{ ok: true } | { error: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required." };

  await db.guide.update({
    where: { id },
    data: { title: trimmed, steps: steps as unknown as object },
  });

  revalidatePath("/accounts/guides");
  return { ok: true };
}

export async function deleteGuide(id: string): Promise<void> {
  await db.guide.delete({ where: { id } });
  revalidatePath("/accounts/guides");
}

// Step 1 of 2 for a guide step's optional image — same direct-to-R2
// presigned-URL mechanism as requestUploadUrl in lib/actions/media.ts,
// but keyed under "guides/" rather than an artistId: Guides are
// platform-wide, not owned by any one artist, so there's no artist to
// scope the key to. Deliberately doesn't create an Image/Media Catalogue
// row — a step's imageUrl is just a plain string in the guide's own
// JSON steps array, the same "business asset, not artwork media"
// reasoning as Artist.logoUrl/signatureUrl. The browser PUTs the file
// straight to the returned uploadUrl; the resulting `url` is then stored
// directly on the step, no separate finalize step needed since nothing
// else needs to reference this image.
export async function requestGuideImageUploadUrl(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; url: string } | { error: string }> {
  if (!contentType.startsWith("image/")) {
    return { error: "Only images can be uploaded." };
  }
  const key = `guides/${randomUUID()}-${sanitizeFilename(filename)}`;
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  return { uploadUrl, url: `/api/media/${key}` };
}
