import { mailBlockTypeLabel, MAIL_WIDTH, type MailTemplateLayout } from "@/lib/mailTemplateLayout";
import { blockWidthOf, groupBlocksByRow, rowKey, rowSettingsOf } from "@/lib/rowLayout";
import { PAGE_MARGIN_CLASS, pageMarginStyle } from "@/components/pageMargins";
import { rowBlockClass, rowBlockStyle, rowClass } from "@/components/pageRows";
import { BlockShape, Labelled } from "@/components/blockShapes";

// Draws a Mail Template's layout as grey placeholders (2026-10-08) — what
// goes where in the mail, with no content: the mail at email width on
// its surround colour, its components in their rows and the footer
// every mail ends with. Used by the Mail Templates page's Preview panel;
// the visual editor (MailLayoutEditor) shows the same footer.
export default function MailTemplatePreview({ layout }: { layout: MailTemplateLayout }) {
  const rows = groupBlocksByRow(layout.blocks);
  return (
    <div
      className="flex min-h-full justify-center rounded-md bg-neutral-100 px-4 py-8"
      style={{ backgroundColor: layout.surroundColor ?? undefined }}
    >
      <div
        className={`flex w-full flex-col bg-white ${PAGE_MARGIN_CLASS}`}
        style={{
          ...pageMarginStyle(layout.margins),
          maxWidth: MAIL_WIDTH,
          backgroundColor: layout.backgroundColor ?? undefined,
        }}
      >
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-400">
            No components yet. Use Edit to add some.
          </p>
        )}
        {rows.map((row, i) => {
          const key = rowKey(row);
          const settings = rowSettingsOf(layout, key);
          const above = i > 0 ? rowSettingsOf(layout, rowKey(rows[i - 1])).below : 0;
          return (
            <div
              key={key}
              className={rowClass(settings.horizontal, settings.vertical)}
              style={{ marginTop: above, gap: settings.between }}
            >
              {row.map((b) => (
                <div key={b.id} className={rowBlockClass()} style={rowBlockStyle(blockWidthOf(b))}>
                  <Labelled label={mailBlockTypeLabel(b.type)}>
                    <BlockShape type={b.type} spacing={layout.gridSpacing} />
                  </Labelled>
                </div>
              ))}
            </div>
          );
        })}
        <MailFooterPlaceholder />
      </div>
    </div>
  );
}

// The footer every mail ends with: the artist's name and address, their
// website and the unsubscribe link.
export function MailFooterPlaceholder() {
  return (
    <div className="mt-8 border-t border-neutral-200 pt-4 text-center text-xs leading-5 text-neutral-400">
      <p>Artist name · Address</p>
      <p className="underline">Website</p>
      <p className="underline">Unsubscribe</p>
    </div>
  );
}
