"use client";

import type { MailTemplateLayout } from "@/lib/mailTemplateLayout";
import { MAIL_FONTS, MAIL_FONT_KINDS, isMailFontId } from "@/lib/mailFonts";
import type { SaveStatus } from "@/components/useAutoSave";
import { ColourControl, FineTuneSection, TextStylesControl } from "@/components/layoutControls";

// What's being edited: the template's name and layout. Held by
// MailTemplatesManager so its visual editor shows every change at once.
export type MailTemplateDraft = { name: string; layout: MailTemplateLayout };

// Templates → Mail Templates' Add / Edit panel (2026-10-08): sits in the
// right-hand column, beside the visual editor (MailLayoutEditor), and
// stays open until Close. Name, the surround and mail background
// colours, then Fine-tune (closed by default) with the exact margins,
// the grid spacing and how the text in its Header, Text and Text grid
// components looks, from the email-safe font list. Saving is automatic
// (see useAutoSave).
export default function MailTemplateEditor({
  draft,
  onChange,
  status,
  onClose,
}: {
  draft: MailTemplateDraft;
  onChange: (draft: MailTemplateDraft) => void;
  status: SaveStatus;
  onClose: () => void;
}) {
  const { layout } = draft;
  const setLayout = (next: MailTemplateLayout) => onChange({ ...draft, layout: next });

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Template name"
          aria-label="Template name"
          autoFocus
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />

        <ColourControl
          label="Surround colour"
          initial="#f5f5f5"
          value={layout.surroundColor}
          onChange={(surroundColor) => setLayout({ ...layout, surroundColor })}
        />
        <ColourControl
          label="Mail background"
          initial="#ffffff"
          value={layout.backgroundColor}
          onChange={(backgroundColor) => setLayout({ ...layout, backgroundColor })}
        />

        <FineTuneSection
          margins={layout.margins}
          gridSpacing={layout.gridSpacing}
          onMargins={(margins) => setLayout({ ...layout, margins })}
          onGridSpacing={(gridSpacing) => setLayout({ ...layout, gridSpacing })}
        >
          <TextStylesControl
            value={layout.textStyles}
            fonts={MAIL_FONTS}
            kinds={MAIL_FONT_KINDS}
            isFont={isMailFontId}
            onChange={(textStyles) => setLayout({ ...layout, textStyles })}
          />
        </FineTuneSection>

        <p className="text-xs text-neutral-400">
          Every mail ends with the artist&apos;s or brand&apos;s name and address, a link to their website and
          an unsubscribe link. A Button&apos;s text, link and colours, and all content, are set
          in each mail.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-3">
        <p className={`min-w-0 text-xs ${status.isError ? "text-red-600" : "text-neutral-500"}`}>
          {status.text}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
