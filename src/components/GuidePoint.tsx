import { splitGuidePoint } from "@/lib/guideText";
import type { GuideStep } from "@/lib/actions/guides";

// One point of a guide as it's read (2026-10-20): a quiet dash, the first
// line bold as its soft heading, the rest beneath, and its picture if it
// has one. Used by Administration → Guides and the artists' Guides page.
export default function GuidePoint({ step }: { step: GuideStep }) {
  const { heading, lines } = splitGuidePoint(step.text);
  return (
    <li className="flex gap-3">
      <span className="shrink-0 text-amber-700">–</span>
      <div className="min-w-0">
        {heading && <p className="text-sm font-semibold text-neutral-900">{heading}</p>}
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-neutral-700">
            {line}
          </p>
        ))}
        {step.imageUrl && (
          <img src={step.imageUrl} alt="" className="mt-2 max-h-48 rounded border border-neutral-200 object-contain" />
        )}
      </div>
    </li>
  );
}
