import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/r2";
import { artworkDetailLines } from "@/lib/artworkDetails";
import { mailReferences, pictureKey, type MailContent } from "@/lib/mailContent";
import type { MailArtwork, MailAssets, MailImage } from "@/lib/mailHtml";

// Looks up everything a campaign mail shows that isn't stored in the mail
// (2026-10-08): the artist's Logo and Signature, the pictures and
// artworks its components use, and the footer's name, address and
// website. Only the site's own artist's images and artworks are ever
// used. Server-only plain module (not "use server"), shared by the
// Preview and, later, sending.
//
// Image addresses inside the app are relative (/api/media/…). The
// Preview uses them as they are (baseUrl ""); an email sent out needs
// full addresses, so sending passes the public address to put in front.

type ImageRow = {
  url: string;
  displayKey: string | null;
  kind: string;
  altText: string | null;
  caption: string | null;
};

const IMAGE_SELECT = { url: true, displayKey: true, kind: true, altText: true, caption: true } as const;

function absolute(url: string, baseUrl: string): string {
  return /^https?:\/\//i.test(url) ? url : `${baseUrl}${url}`;
}

// The display-size version when there is one (served straight from
// storage), otherwise the original. Videos aren't shown in mails.
function toMailImage(image: ImageRow | null, baseUrl: string, fallbackAlt: string): MailImage | null {
  if (!image || image.kind !== "PHOTO") return null;
  return {
    src: publicMediaUrl(image.displayKey) ?? absolute(image.url, baseUrl),
    alt: image.altText || image.caption || fallbackAlt,
  };
}

export async function loadMailAssets(
  siteId: string,
  content: MailContent,
  baseUrl: string
): Promise<MailAssets | null> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      domain: true,
      artistId: true,
      artist: {
        select: {
          name: true,
          logoUrl: true,
          signatureUrl: true,
          addressLine1: true,
          city: true,
          postcode: true,
          country: true,
        },
      },
    },
  });
  if (!site) return null;
  const { artist, artistId } = site;

  const { pictures, artworkIds } = mailReferences(content);
  const mediaIds = pictures.filter((p) => p.kind === "media").map((p) => p.id);
  const pictureArtworkIds = pictures.filter((p) => p.kind === "artwork").map((p) => p.id);

  const [mediaRows, artworkRows] = await Promise.all([
    mediaIds.length > 0
      ? db.image.findMany({
          where: { id: { in: mediaIds }, artistId },
          select: { id: true, ...IMAGE_SELECT },
        })
      : [],
    artworkIds.length + pictureArtworkIds.length > 0
      ? db.artwork.findMany({
          where: { id: { in: [...new Set([...artworkIds, ...pictureArtworkIds])] }, artistId },
          select: {
            id: true,
            catalogueName: true,
            type: true,
            size: true,
            medium: true,
            offeredPrice: true,
            priceCurrency: true,
            mainImage: { select: IMAGE_SELECT },
            images: { take: 1, orderBy: { createdAt: "asc" }, select: IMAGE_SELECT },
          },
        })
      : [],
  ]);

  const pictureMap: Record<string, MailImage> = {};
  for (const row of mediaRows) {
    const image = toMailImage(row, baseUrl, "");
    if (image) pictureMap[pictureKey({ kind: "media", id: row.id })] = image;
  }

  const artworks: Record<string, MailArtwork> = {};
  for (const row of artworkRows) {
    const image = toMailImage(row.mainImage ?? row.images[0] ?? null, baseUrl, row.catalogueName);
    if (image) pictureMap[pictureKey({ kind: "artwork", id: row.id })] = image;
    artworks[row.id] = {
      image,
      title: row.catalogueName,
      details: artworkDetailLines(row),
      price:
        row.offeredPrice != null
          ? { amount: Number(row.offeredPrice), currency: row.priceCurrency }
          : null,
      // The artwork's own page on the website — not available yet.
      url: null,
    };
  }

  const placeLine = [artist.postcode, artist.city].filter(Boolean).join(" ");
  return {
    logo: artist.logoUrl ? { src: absolute(artist.logoUrl, baseUrl), alt: artist.name } : null,
    signature: artist.signatureUrl
      ? { src: absolute(artist.signatureUrl, baseUrl), alt: artist.name }
      : null,
    pictures: pictureMap,
    artworks,
    footer: {
      name: artist.name,
      address: [artist.addressLine1, placeLine, artist.country].filter(
        (l): l is string => Boolean(l?.trim())
      ),
      website: site.domain ? { label: site.domain, url: `https://${site.domain}` } : null,
    },
  };
}
