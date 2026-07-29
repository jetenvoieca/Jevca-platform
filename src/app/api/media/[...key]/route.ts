import { NextRequest } from "next/server";
import { getFromR2 } from "@/lib/r2";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const objectKey = key.join("/");

  try {
    const object = await getFromR2(objectKey);
    if (!object.Body) {
      return new Response("Not found", { status: 404 });
    }
    const bytes = await object.Body.transformToByteArray();
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return new Response(new Blob([arrayBuffer]), {
      headers: {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
