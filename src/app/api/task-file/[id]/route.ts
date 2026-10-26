import { passes, requireAdmin } from "@/lib/currentUser";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getFromR2 } from "@/lib/r2";

// One file or image added to a task (2026-10-11) — see the TaskFile model.
// Behind the admin login (not one of middleware.ts's public paths). Plain
// images and PDFs open in the browser; anything else downloads. Nothing
// here can run code on this app's address: nosniff, and everything but a
// PDF (whose viewer won't open in a sandbox) is sandboxed.
const SHOWN_IN_PLACE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await passes(requireAdmin()))) return new Response("Not allowed.", { status: 403 });
  const file = await db.taskFile.findUnique({
    where: { id },
    select: { filename: true, contentType: true, r2Key: true },
  });
  if (!file) return new Response("File not found", { status: 404 });

  const object = await getFromR2(file.r2Key);
  if (!object.Body) return new Response("File not found", { status: 404 });
  const bytes = await object.Body.transformToByteArray();

  const inline = SHOWN_IN_PLACE.has(file.contentType);
  const asciiName = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Blob([new Uint8Array(bytes)]), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      ...(file.contentType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox" }),
    },
  });
}
