import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import WebsiteEditorPage from "../WebsiteEditorPage";

export const dynamic = "force-dynamic";

// Administration → Website → one content page (2026-09-29).
export default async function WebsiteContentPageEditorRoute({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const page = await db.websitePage.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!page) notFound();

  return <WebsiteEditorPage selectedId={page.id} />;
}
