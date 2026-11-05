"use client";

import { useEffect, useState, useTransition } from "react";
import {
  applyDerivativeLinks,
  previewDerivativeLinks,
  type DerivativeLinkPlan,
} from "@/lib/actions/derivativeLinks";
import FormModal from "@/components/FormModal";
import { primaryButtonCls } from "@/components/subscriberFormParts";

// Link derivatives (2026-11-05, admin only — see
// lib/actions/derivativeLinks.ts): the links proposed, the names to sort
// by hand, then Link all.
export default function LinkDerivativesModal({
  siteId,
  artistId,
  onDone,
  onClose,
}: {
  siteId: string;
  artistId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<DerivativeLinkPlan | null>(null);
  const [done, setDone] = useState<{ linked: number; bases: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    previewDerivativeLinks(artistId).then((p) => {
      if (current) setPlan(p);
    });
    return () => {
      current = false;
    };
  }, [artistId]);

  const apply = () =>
    startTransition(async () => {
      setDone(await applyDerivativeLinks(siteId, artistId));
      onDone();
    });

  return (
    <FormModal title="Link derivatives" busy={isPending} onClose={onClose}>
      {!plan ? (
        <p className="text-sm text-neutral-400">Checking the catalogue…</p>
      ) : done ? (
        <p className="text-sm text-neutral-700">
          Linked {done.linked} work{done.linked === 1 ? "" : "s"} to {done.bases} Original{done.bases === 1 ? "" : "s"},
          now ticked Base.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Works that aren&apos;t Originals, not yet derived from anything, linked to the Original of the same name —
            which is ticked Base.
          </p>
          {plan.links.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing to link.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border border-neutral-200">
              <table className="w-full text-left text-sm">
                <tbody>
                  {plan.links.map((l) => (
                    <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-2 py-1.5 text-neutral-900">{l.name}</td>
                      <td className="px-2 py-1.5 text-neutral-500">
                        #{l.catalogueNumber} {l.type ? `· ${l.type}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-neutral-500">→ #{l.originalNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan.unclear.length > 0 && (
            <div className="text-sm text-neutral-600">
              <p className="font-medium">Left alone — more than one Original of the name:</p>
              <ul className="mt-1 list-inside list-disc">
                {plan.unclear.map((u) => (
                  <li key={u.name}>
                    {u.name} ({u.originals} Originals, {u.works} work{u.works === 1 ? "" : "s"})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.noOriginal > 0 && (
            <p className="text-sm text-neutral-500">
              {plan.noOriginal} work{plan.noOriginal === 1 ? " has" : "s have"} no Original of the same name.
            </p>
          )}
          {plan.links.length > 0 && (
            <button type="button" onClick={apply} disabled={isPending} className={primaryButtonCls}>
              {isPending ? "Linking…" : `Link ${plan.links.length} work${plan.links.length === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      )}
    </FormModal>
  );
}
