import { listGuides } from "@/lib/actions/guides";

export const dynamic = "force-dynamic";

// Read-only rendering of the USER-category guides already maintained in
// Administration -> Guides (see GuidesPanel.tsx and lib/actions/guides.ts)
// -- same data, same /api/guide/[id] PDF route, just no Edit/Delete and
// no "+ New Topic" (2026-09-13, direct request: "show user guides from
// guides in Administration guides", "remove edit/delete buttons - PDF
// can stay", "remove the add new topic buttons"). Technical-category
// guides are developer documentation, not shown here.
export default async function PreviewGuidesPage() {
  const guides = (await listGuides()).filter((g) => g.category === "USER");

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Guides</h1>

      {guides.length === 0 ? (
        <p className="text-sm text-neutral-400">No guides yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {guides.map((guide) => (
            <div key={guide.id} className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900">
                  {guide.title}
                </h2>
                <a
                  href={`/api/guide/${guide.id}`}
                  className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                >
                  PDF
                </a>
              </div>

              {guide.steps.length === 0 ? (
                <p className="text-sm text-neutral-400">Nothing here yet.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {guide.steps.map((step, idx) => (
                    <li key={step.id} className="flex gap-3">
                      <span className="shrink-0 font-semibold text-amber-700">{idx + 1}</span>
                      <div>
                        <p className="text-sm text-neutral-700">{step.text}</p>
                        {step.imageUrl && (
                          <img
                            src={step.imageUrl}
                            alt=""
                            className="mt-2 max-h-48 rounded border border-neutral-200 object-contain"
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
