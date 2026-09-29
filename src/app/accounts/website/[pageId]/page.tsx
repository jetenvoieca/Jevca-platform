import WebsiteEditorPage from "../WebsiteEditorPage";

export const dynamic = "force-dynamic";

// Administration → Website → one content page (2026-09-29).
// WebsiteEditorPage shows a 404 if the page doesn't exist.
export default async function WebsiteContentPageEditorRoute({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  return <WebsiteEditorPage selectedId={pageId} />;
}
