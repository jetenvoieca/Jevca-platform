import { NextRequest, NextResponse } from "next/server";
import { getPersonalAttachment, GmailNotConnectedError } from "@/lib/gmailMessages";

// One attachment (or inline image) from Craig's Gmail, for the Inbox's
// Personal tab (2026-10-09). Fetched live from Gmail; behind the admin
// login. Shown in the browser where it can be (images, PDFs), otherwise
// downloaded. The type comes from the email, so only these plain kinds
// are ever shown in place (never SVG or HTML, which could run code on
// this app's address), and everything but a PDF (whose viewer won't open
// in a sandbox) is sandboxed regardless.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const messageId = params.get("message");
  const attachmentId = params.get("id");
  if (!messageId || !attachmentId) return new NextResponse("Missing attachment.", { status: 400 });

  try {
    const data = await getPersonalAttachment(messageId, attachmentId);
    const name = (params.get("name") || "attachment").replace(/["\r\n]/g, "");
    const type = params.get("type") || "application/octet-stream";
    const inline = INLINE_TYPES.has(type);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        ...(type === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox" }),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const status = err instanceof GmailNotConnectedError ? 401 : 502;
    return new NextResponse(err instanceof Error ? err.message : "Couldn't fetch the attachment.", { status });
  }
}
