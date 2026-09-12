// Placeholder only for now (2026-09-12, direct request — "add a guides
// item, placeholder for now"). The real read-only guides view (pulling
// from the same Administration → Guides content, PDF button only, no
// edit/delete/add) is separate, later work.
export const dynamic = "force-dynamic";

export default function PreviewGuidesPage() {
  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Guides</h1>
      <p className="max-w-md text-sm text-neutral-500">Guides are coming soon here.</p>
    </div>
  );
}
