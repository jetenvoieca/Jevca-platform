"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCertificateTemplate,
  updateCertificateTemplate,
  removeCertificateTemplate,
  type CertificateTemplateRow,
} from "@/lib/actions/certificateSettings";

// Certificate of Authenticity templates card (2026-09-04) — the last
// piece of the Certificate of Authenticity Settings UI described in the
// 2026-09-03 handover. Full width, sits below the Financial/Invoicing
// row on the Financial tab. Each template pairs a bold Label (matched
// against Artwork.type, same free-text convention as ArtworkType/Group/
// Location/Medium elsewhere) with its certifying Text below — both
// blur-to-save, same "no separate Save button" convention as every other
// autosaving field on this page.
export default function CertificateTemplatesCard({
  artistId,
  siteId,
  templates,
}: {
  artistId: string;
  siteId: string;
  templates: CertificateTemplateRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addFormRef = useRef<HTMLFormElement>(null);

  const saveField = (id: string, field: "label" | "text", value: string, other: string) => {
    const fd = new FormData();
    fd.set("label", field === "label" ? value : other);
    fd.set("text", field === "text" ? value : other);
    startTransition(async () => {
      const res = await updateCertificateTemplate(id, siteId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  };

  const handleRemove = (id: string) => {
    if (
      !confirm(
        "Remove this certificate template? Any artwork Type that matched it will error when a certificate is requested, until a replacement template is added."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await removeCertificateTemplate(id, siteId);
      router.refresh();
    });
  };

  const handleAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await addCertificateTemplate(artistId, siteId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      addFormRef.current?.reset();
      setAddOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Certificate Of Authenticity
      </p>
      <p className="mb-3 text-xs text-neutral-400">
        One template per artwork Type — matched against an artwork&apos;s own Type the same way
        Groups/Locations/Mediums are, not a strict list. If a Type matches none of these, the
        certificate can&apos;t be generated until one is added here.
      </p>

      <div className="flex flex-col gap-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-md border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <input
                key={`label-${t.id}`}
                defaultValue={t.label}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== t.label) saveField(t.id, "label", value, t.text);
                }}
                disabled={isPending}
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm font-semibold disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleRemove(t.id)}
                disabled={isPending}
                className="shrink-0 text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
            <textarea
              key={`text-${t.id}`}
              defaultValue={t.text}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== t.text) saveField(t.id, "text", value, t.label);
              }}
              disabled={isPending}
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-xs text-neutral-400">No templates yet — add one below.</p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {addOpen ? (
        <form
          ref={addFormRef}
          action={handleAdd}
          className="mt-3 flex flex-col gap-2 rounded-md border border-dashed border-neutral-300 p-3"
        >
          <input
            type="text"
            name="label"
            required
            placeholder="Label — e.g. Original"
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm font-semibold"
          />
          <textarea
            name="text"
            required
            rows={3}
            placeholder="I certify that this work is…"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-3 w-full rounded-md border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
        >
          + Add template
        </button>
      )}
    </div>
  );
}
