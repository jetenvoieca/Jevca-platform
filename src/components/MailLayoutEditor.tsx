"use client";

import type { ReactNode } from "react";
import {
  MAIL_BLOCK_TYPES,
  MAIL_WIDTH,
  newMailBlock,
  type MailBlock,
  type MailTemplateLayout,
} from "@/lib/mailTemplateLayout";
import { BlockShape } from "@/components/blockShapes";
import VisualLayoutEditor, {
  type BlockSettingsPanel,
  type BlockToggle,
  type TextStyleFonts,
} from "@/components/VisualLayoutEditor";
import { MAIL_FONTS, MAIL_FONT_KINDS, isMailFontId } from "@/lib/mailFonts";
import { MailFooterPlaceholder } from "@/components/MailTemplatePreview";

// The visual editor for a mail's layout (2026-10-08) — a Mail Template's,
// or a campaign mail's own copy of it: the same editor as Page Styles
// (VisualLayoutEditor), at email width, with the mail's components, its
// surround and background colours, and its fixed footer. A Mail
// Template draws each component's outline. A campaign mail gives
// `renderBlock` (its content, typed in place), `settingsPanel` (a
// Button's link and colours) and `blockToggle` (a Gallery's
// Regularise), and is drawn `fluid` so the boxes to type into stay full
// size.
// A Header, Text or Text grid component's own Text style (2026-10-10),
// in the mail fonts.
const MAIL_TEXT_STYLE_FONTS: TextStyleFonts = { fonts: MAIL_FONTS, kinds: MAIL_FONT_KINDS, isFont: isMailFontId };

export default function MailLayoutEditor({
  layout,
  onChange,
  renderBlock,
  settingsPanel,
  blockToggle,
  fluid = false,
}: {
  layout: MailTemplateLayout;
  onChange: (layout: MailTemplateLayout) => void;
  renderBlock?: (block: MailBlock) => ReactNode;
  settingsPanel?: (block: MailBlock) => BlockSettingsPanel | null;
  blockToggle?: (block: MailBlock) => BlockToggle | null;
  fluid?: boolean;
}) {
  return (
    <VisualLayoutEditor<MailBlock, MailTemplateLayout>
      layout={layout}
      onChange={onChange}
      components={MAIL_BLOCK_TYPES}
      newBlock={newMailBlock}
      renderBlock={renderBlock ?? ((b) => <MailBlockShape block={b} layout={layout} />)}
      settingsPanel={settingsPanel}
      blockToggle={blockToggle}
      textStyleFonts={MAIL_TEXT_STYLE_FONTS}
      desktopWidth={MAIL_WIDTH}
      backgroundColor={layout.backgroundColor}
      surroundColor={layout.surroundColor}
      fluid={fluid}
      footer={<MailFooterPlaceholder />}
    />
  );
}

// A component's outline, as in the Mail Template's Preview.
export function MailBlockShape({ block, layout }: { block: MailBlock; layout: MailTemplateLayout }) {
  return <BlockShape type={block.type} spacing={layout.gridSpacing} />;
}
