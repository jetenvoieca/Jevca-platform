"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---- Reading data for the "Add New Site" picker ----

export async function getArtistsForPicker() {
  return db.artist.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// ---- Create a new Site (and, if needed, a new Artist) ----

export type CreateSiteState = { error?: string };

export async function createSite(
  _prevState: CreateSiteState,
  formData: FormData
): Promise<CreateSiteState> {
  const siteName = (formData.get("siteName") as string)?.trim();
  const existingArtistId = (formData.get("artistId") as string) || "";
  const newArtistName = (formData.get("newArtistName") as string)?.trim() || "";

  if (!siteName) {
    return { error: "Site name is required." };
  }
  if (existingArtistId && newArtistName) {
    return { error: "Choose an existing artist OR type a new one — not both." };
  }
  if (!existingArtistId && !newArtistName) {
    return { error: "Choose an existing artist, or type a new artist name to create one." };
  }

  let artistId = existingArtistId;

  if (!artistId) {
    const newArtist = await db.artist.create({
      data: { name: newArtistName },
    });
    artistId = newArtist.id;
  }

  const site = await db.site.create({
    data: { name: siteName, artistId },
  });

  revalidatePath("/");
  // Back to the Sites Directory with the new site's details panel already
  // open, rather than into the Web Site editor — which, for a site with no
  // pages yet, just looks blank. Domain, currency, template etc. all get
  // filled in from right here.
  redirect(`/?selected=${site.id}`);
}

// ---- Edit Site details (name, domain) ----

export async function updateSite(id: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  const domainRaw = (formData.get("domain") as string)?.trim() || null;
  const defaultCurrency = (formData.get("defaultCurrency") as string)?.trim() || "GBP";
  const template = (formData.get("template") as string)?.trim() || "Default";
  const domainStatus = (formData.get("domainStatus") as string)?.trim() || null;
  const domainRenewalDateRaw = (formData.get("domainRenewalDate") as string)?.trim();
  const domainRenewalDate = domainRenewalDateRaw ? new Date(domainRenewalDateRaw) : null;
  const domainRenewalCostRaw = (formData.get("domainRenewalCost") as string)?.trim();
  const domainRenewalCost = domainRenewalCostRaw ? domainRenewalCostRaw : null;
  // Store domains without a leading protocol/www so they're consistent
  // however someone happens to type them in.
  const domain = domainRaw
    ? domainRaw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")
    : null;
  if (!name) return;

  await db.site.update({
    where: { id },
    data: {
      name,
      domain,
      defaultCurrency,
      template,
      domainStatus,
      domainRenewalDate,
      domainRenewalCost,
    },
  });
  revalidatePath("/");
}

// ---- Edit Owner (Artist) details ----

export async function updateArtist(id: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const subscriptionAmountRaw = (formData.get("subscriptionAmount") as string)?.trim();
  const subscriptionAmount = subscriptionAmountRaw ? subscriptionAmountRaw : null;
  const paymentMethod = (formData.get("paymentMethod") as string)?.trim() || null;
  if (!name) return;

  await db.artist.update({
    where: { id },
    data: { name, email, phone, notes, subscriptionAmount, paymentMethod },
  });
  revalidatePath("/");
}

// ---- Status toggle (Draft / Live / Paused) ----

export async function updateSiteStatus(
  id: string,
  status: "DRAFT" | "LIVE" | "PAUSED" | "ISYT"
) {
  await db.site.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/");
}

// ---- Archive (soft delete) / Restore ----

export async function archiveSite(id: string) {
  await db.site.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
  revalidatePath("/");
}

export async function restoreSite(id: string) {
  // Restored sites come back as Draft — a safe default.
  // You can immediately switch it to Live/Paused with the status dropdown if needed.
  await db.site.update({
    where: { id },
    data: { status: "DRAFT" },
  });
  revalidatePath("/");
}

// ---- Sample data, for trying the screen out before real data exists ----

export async function seedSampleData() {
  const jane = await db.artist.create({
    data: { name: "Jane Doe", email: "jane@example.com", status: "ACTIVE" },
  });

  const sam = await db.artist.create({
    data: { name: "Sam Lee", email: "sam@example.com", status: "ACTIVE" },
  });

  await db.site.create({
    data: {
      name: "Jane Doe — Main Site",
      domain: "janedoeartist.com",
      status: "LIVE",
      artistId: jane.id,
    },
  });

  // Same artist, second alias site — demonstrates one Artist -> many Sites.
  await db.site.create({
    data: {
      name: "Jane Doe — Studio Alias",
      status: "PAUSED",
      artistId: jane.id,
    },
  });

  await db.site.create({
    data: {
      name: "Sam Lee Art",
      status: "DRAFT",
      artistId: sam.id,
    },
  });

  revalidatePath("/");
}
