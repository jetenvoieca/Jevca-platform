import WebsiteEditorPage from "./WebsiteEditorPage";

export const dynamic = "force-dynamic";

// Administration → Website (2026-09-29) — opens on the Home page.
export default async function WebsiteHomeEditorRoute() {
  return <WebsiteEditorPage selectedId={null} />;
}
