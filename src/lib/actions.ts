"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

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
    },
  });
  revalidatePath("/");
  revalidatePath(`/sites/${id}`);
}

// ---- Edit Owner (Artist) details ----

export async function updateArtist(id: string, formData: FormData): Promise<void> {
  const name = (formData.get("name") as string)?.trim();
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const subscriptionAmountRaw = (formData.get("subscriptionAmount") as string)?.trim();
  const subscriptionAmount = subscriptionAmountRaw ? subscriptionAmountRaw : null;
  const paymentMethod = (formData.get("paymentMethod") as string)?.trim() || null;
  const invoiceAddress = (formData.get("invoiceAddress") as string)?.trim() || null;
  const vatNumber = (formData.get("vatNumber") as string)?.trim() || null;
  const vatRateRaw = (formData.get("vatRate") as string)?.trim();
  const vatRate = vatRateRaw ? vatRateRaw : null;
  const invoiceFooterText = (formData.get("invoiceFooterText") as string)?.trim() || null;
  const invoiceLanguageRaw = (formData.get("invoiceLanguage") as string)?.trim().toUpperCase();
  const invoiceLanguage = invoiceLanguageRaw === "FR" ? "FR" : "EN";
  const nextInvoiceNumberRaw = (formData.get("nextInvoiceNumber") as string)?.trim();
  if (!name) return;

  await db.artist.update({
    where: { id },
    data: {
      name,
      firstName,
      email,
      phone,
      notes,
      subscriptionAmount,
      paymentMethod,
      invoiceAddress,
      vatNumber,
      vatRate,
      invoiceFooterText,
      invoiceLanguage,
      // Only ever moves this forward deliberately (e.g. correcting a
      // starting point) — the actual per-invoice increment happens in
      // getOrAssignInvoiceNumber, not here, so leave it alone unless the
      // field was actually submitted with a value.
      ...(nextInvoiceNumberRaw ? { nextInvoiceNumber: parseInt(nextInvoiceNumberRaw, 10) } : {}),
    },
  });
  revalidatePath("/");
}

// Deliberately its own action, not folded into the general updateArtist
// autosave above (2026-08-09) — switching to Live means every sale this
// artist takes from that point starts charging real cards, so this is a
// standalone, explicit action rather than something that could fire
// silently as a side effect of saving an unrelated field.
export async function updateArtistStripeMode(id: string, mode: "TEST" | "LIVE"): Promise<void> {
  await db.artist.update({ where: { id }, data: { stripeMode: mode } });
  revalidatePath("/");
}

// The logo needs its own action rather than folding into updateArtist —
// it arrives via the direct-to-R2 upload flow (see requestUploadUrl in
// media.ts, reused here since it's already generic), not a plain form
// field, and this artist-identity logo deliberately doesn't create an
// Image/Media Catalogue row — it's a business asset, not artwork media.
export async function saveArtistLogo(artistId: string, key: string): Promise<void> {
  await db.artist.update({
    where: { id: artistId },
    data: { logoUrl: `/api/media/${key}` },
  });
  revalidatePath("/");
}

// Deliberately its own action, not folded into the autosave updateArtist
// above — regenerating this immediately breaks any copy of the iPhone
// Shortcut still configured with the old value, so it needs to be a
// conscious button click with its own confirmation, not something that
// could fire from a stray text-field edit.
export async function regenerateHopperToken(artistId: string): Promise<{ token: string }> {
  const token = randomUUID();
  await db.artist.update({
    where: { id: artistId },
    data: { hopperToken: token },
  });
  revalidatePath("/");
  return { token };
}

// ---- Status toggle (Draft / Live / Paused) ----

// 2026-08-19, direct request — Archived used to be a separate action
// (archiveSite/restoreSite, a distinct button in the UI) even though
// it's always been the exact same underlying field as every other
// status. Folded in here so there's one action and one control for the
// whole thing, not two mechanisms doing the same kind of update.
export async function updateSiteStatus(
  id: string,
  status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | "ISYT"
) {
  await db.site.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/");
  revalidatePath(`/sites/${id}`);
}

// ---- "Take payments" toggle (was labelled "Show Sales menu on this
// site" — same underlying field, renamed 2026-08-13). Gates both the
// Sales/Customers nav items (SiteNavPanel) and the Invoicing panel on the
// site's Settings page — a site that doesn't take payments has no use
// for invoice numbering/VAT/etc.
export async function updateSalesEnabled(id: string, enabled: boolean) {
  await db.site.update({
    where: { id },
    data: { salesEnabled: enabled },
  });
  revalidatePath("/");
  revalidatePath(`/sites/${id}`);
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

