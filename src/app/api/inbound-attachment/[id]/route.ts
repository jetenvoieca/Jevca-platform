import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getFromR2 } from "@/lib/r2";

// Downloads one attachment of an inbound email (2026-09-24) — see the
// InboundEmailAttachment model in schema.prisma. Deliberately NOT one
// of middleware.ts's public paths, so only a logged-in admin session
// can reach it: emails can carry private documents, unlike the media
// library served by /api/media.
//
// Always sent as a download (Content-Disposition: attachment) with
// nosniff, never shown inline — an attachment can be any file a stranger
// chose to send, including HTML, which must never be rendered on this
// app's own domain.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachment = await db.inboundEmailAttachment.findUnique({
    where: { id },
    select: { filename: true, contentType: true, r2Key: true },
  });
  if (!attachment?.r2Key) {
    return new Response("Attachment not found", { status: 404 });
  }

  const object = await getFromR2(attachment.r2Key);
  if (!object.Body) {
    return new Response("Attachment not found", { status: 404 });
  }
  const bytes = await object.Body.transformToByteArray();

  const asciiName = attachment.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Blob([new Uint8Array(bytes)]), {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
        attachment.filename
      )}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
