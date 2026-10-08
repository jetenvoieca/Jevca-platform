"use client";

import {
  MAIL_BLOCK_TYPES,
  MAIL_WIDTH,
  newMailBlock,
  type MailBlock,
  type MailTemplateLayout,
} from "@/lib/mailTemplateLayout";
import { BlockShape } from "@/components/blockShapes";
import VisualLayoutEditor from "@/components/VisualLayoutEditor";
import { MailFooterPlaceholder } from "@/components/MailTemplatePreview";

// The visual editor for a Mail Template (2026-10-08) — the same editor
// as Page Styles (VisualLayoutEditor), at email width, with the mail's
// components, its surround and background colours, and its fixed footer.
export default function MailLayoutEditor({
  layout,
  onChange,
}: {
  layout: MailTemplateLayout;
  onChange: (layout: MailTemplateLayout) => void;
}) {
  return (
    <VisualLayoutEditor<MailBlock, MailTemplateLayout>
      layout={layout}
      onChange={onChange}
      components={MAIL_BLOCK_TYPES}
      newBlock={newMailBlock}
      renderBlock={(b) => <BlockShape type={b.type} spacing={layout.gridSpacing} />}
      desktopWidth={MAIL_WIDTH}
      backgroundColor={layout.backgroundColor}
      surroundColor={layout.surroundColor}
      footer={<MailFooterPlaceholder />}
    />
  );
}
