"use client";

import {
  MAIL_BLOCK_TYPES,
  MAIL_WIDTH,
  newMailBlock,
  type MailBlock,
  type MailTemplateLayout,
} from "@/lib/mailTemplateLayout";
import { BlockShape } from "@/components/blockShapes";
import VisualLayoutEditor, { type BlockBarButton } from "@/components/VisualLayoutEditor";
import { MailFooterPlaceholder } from "@/components/MailTemplatePreview";

// The visual editor for a mail's layout (2026-10-08) — a Mail Template's,
// or a campaign mail's own copy of it: the same editor as Page Styles
// (VisualLayoutEditor), at email width, with the mail's components, its
// surround and background colours, and its fixed footer. A campaign
// mail adds a Content button to each component that has content.
export default function MailLayoutEditor({
  layout,
  onChange,
  blockButton,
}: {
  layout: MailTemplateLayout;
  onChange: (layout: MailTemplateLayout) => void;
  blockButton?: (block: MailBlock) => BlockBarButton | null;
}) {
  return (
    <VisualLayoutEditor<MailBlock, MailTemplateLayout>
      layout={layout}
      onChange={onChange}
      components={MAIL_BLOCK_TYPES}
      newBlock={newMailBlock}
      blockButton={blockButton}
      renderBlock={(b) => <BlockShape type={b.type} spacing={layout.gridSpacing} />}
      desktopWidth={MAIL_WIDTH}
      backgroundColor={layout.backgroundColor}
      surroundColor={layout.surroundColor}
      footer={<MailFooterPlaceholder />}
    />
  );
}
