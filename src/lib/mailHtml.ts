import { mailFontStack } from "@/lib/mailFonts";
import {
  BUTTON_DEFAULT_COLOUR,
  BUTTON_DEFAULT_TEXT_COLOUR,
  contentOf,
  pictureKey,
  type MailContent,
  type MailLanguage,
} from "@/lib/mailContent";
import { MAIL_WIDTH, type MailBlock, type MailTemplateLayout, type MailTextStyle } from "@/lib/mailTemplateLayout";
import { blockWidthOf, groupBlocksByRow, rowKey, rowSettingsOf, type RowSettings } from "@/lib/rowLayout";
import { escapeHtml, isRichTextEmpty, richTextToHtml, type RichText } from "@/lib/richText";
import { mergeTextStyle } from "@/lib/textStyle";

// A campaign mail as the email itself (2026-10-08, Marketing step 3) —
// the one HTML used both for the Preview and for sending, so what's
// previewed is exactly what's sent. Built the way email apps need it:
// tables for layout, styles written on each element, 600px wide. In a
// narrower window (a reading pane, 2026-10-10) it shrinks to fit with
// side-by-side components kept side by side; on a phone (below 480px)
// they stack, each full width.
// A component with nothing in it shows nothing. Plain module, not
// "use server".

// `square`: its square version, for a gallery set to Regularise (only
// looked up for pictures in such a gallery).
export type MailImage = { src: string; alt: string; square?: string };

export type MailArtwork = {
  image: MailImage | null;
  title: string;
  details: string[];
  price: { amount: number; currency: string } | null;
  // The artwork's page on the artist's website, when there is one.
  url: string | null;
};

// Everything the mail shows that isn't stored in the mail itself.
export type MailAssets = {
  logo: MailImage | null;
  signature: MailImage | null;
  // By pictureKey().
  pictures: Record<string, MailImage>;
  artworks: Record<string, MailArtwork>;
  footer: {
    name: string;
    address: string[];
    website: { label: string; url: string } | null;
  };
};

export type MailHtmlInput = {
  layout: MailTemplateLayout;
  content: MailContent;
  language: MailLanguage;
  subject: string;
  preview: string;
  assets: MailAssets;
  unsubscribeUrl: string;
};

const PHONE_BREAKPOINT = 480;
const LOGO_WIDTH = 200;
const SIGNATURE_WIDTH = 180;
const ARTWORK_GAP = 16;

const TEXT_BLOCKS = new Set<MailBlock["type"]>(["header", "text", "textgrid", "artwork"]);

const FOOTER_LABELS: Record<MailLanguage, { unsubscribe: string }> = {
  en: { unsubscribe: "Unsubscribe" },
  fr: { unsubscribe: "Se désinscrire" },
};

// A text component's own look when the template doesn't set one.
const TEXT_DEFAULTS = {
  header: { size: 24, look: "bold", lineHeight: 1.25 },
  text: { size: 15, look: "regular", lineHeight: 1.5 },
  textgrid: { size: 14, look: "regular", lineHeight: 1.5 },
} as const;

const DEFAULT_TEXT_COLOUR = "#222222";

export type TextKind = keyof typeof TEXT_DEFAULTS;

// A text component's look: its own (from its bar's Text style), then the
// template's for its kind, then the defaults above.
export function styleOf(layout: MailTemplateLayout, kind: TextKind, block?: MailBlock): MailTextStyle {
  return mergeTextStyle(layout.textStyles[kind], block?.textStyle);
}

// How a text component's text looks, with the defaults filled in — the
// one definition used by the mail itself and by the campaign editor's
// typing boxes (2026-10-10), so they always match.
export type MailTextLook = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  color: string;
  fontWeight: "bold" | "normal";
  fontStyle: "italic" | "normal";
};

export function mailTextLook(style: MailTextStyle, kind: TextKind, extraSize = 0): MailTextLook {
  const defaults = TEXT_DEFAULTS[kind];
  const look = style.look ?? defaults.look;
  return {
    fontFamily: mailFontStack(style.font ?? "arial"),
    fontSize: (style.size ?? defaults.size) + extraSize,
    lineHeight: defaults.lineHeight,
    color: style.colour ?? DEFAULT_TEXT_COLOUR,
    fontWeight: look === "bold" ? "bold" : "normal",
    fontStyle: look === "italic" ? "italic" : "normal",
  };
}

function textCss(style: MailTextStyle, kind: TextKind, extraSize = 0): string {
  const look = mailTextLook(style, kind, extraSize);
  return [
    `font-family:${look.fontFamily}`,
    `font-size:${look.fontSize}px`,
    `line-height:${look.lineHeight}`,
    `color:${look.color}`,
    `font-weight:${look.fontWeight}`,
    `font-style:${look.fontStyle}`,
  ].join(";");
}

// A picture `width` pixels wide, never wider than its space. `fluid`
// (pictures, galleries, artworks): fills its space on a phone; the Logo
// and Signature keep their own size there.
function imageHtml(image: MailImage, width: number, href: string | null = null, fluid = true): string {
  const img = `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="${width}"${fluid ? ' class="fluid"' : ""} style="display:block;width:${width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
  return href ? `<a href="${escapeHtml(href)}" target="_blank">${img}</a>` : img;
}

// Something narrower than its space (the Logo, the Signature) placed
// left, centre or right in it. A table with `align` does this in every
// email app — the picture itself is drawn as a block, which the space's
// own text alignment doesn't move.
function alignedHtml(html: string, align: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}"><tr><td>${html}</td></tr></table>`;
}

// Side-by-side cells, `container` pixels wide at full size, that stack
// on a phone. Widths are given as shares (%), so in a narrower window
// they shrink together and stay side by side.
function columnsHtml(
  cells: { width: number; html: string; valign?: string }[],
  gap: number,
  container: number
): string {
  const total = cells.reduce((sum, c) => sum + c.width, 0) + gap * (cells.length - 1);
  const share = (px: number) => `${((px / total) * 100).toFixed(2)}%`;
  const parts = cells.map((c, i) => {
    const cell = `<td class="col" width="${share(c.width)}" valign="${c.valign ?? "top"}" style="width:${share(c.width)};">${c.html}</td>`;
    return i === 0
      ? cell
      : `<td class="gap" width="${share(gap)}" style="width:${share(gap)};height:${gap}px;font-size:0;line-height:0;">&nbsp;</td>${cell}`;
  });
  const width = `${Math.min(100, (total / container) * 100).toFixed(2)}%`;
  return `<table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0" width="${width}" style="width:${width};"><tr>${parts.join("")}</tr></table>`;
}

// Splits `width` into `count` equal parts with `gap` between them.
function equalWidths(width: number, count: number, gap: number): number[] {
  const each = Math.floor((width - gap * (count - 1)) / count);
  return Array.from({ length: count }, () => each);
}

function richHtml(style: MailTextStyle, kind: TextKind, doc: RichText): string {
  return richTextToHtml(doc, textCss(style, kind), Math.round(TEXT_DEFAULTS[kind].size * 0.8));
}

function formatPrice(price: { amount: number; currency: string }, language: MailLanguage): string {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-GB", {
    style: "currency",
    currency: price.currency,
  }).format(price.amount);
}

// One component's HTML at `width` pixels, or "" when it has nothing to
// show.
function blockHtml(input: MailHtmlInput, block: MailBlock, width: number, align: string): string {
  const { layout, content, language, assets } = input;
  switch (block.type) {
    case "logo":
      return assets.logo ? alignedHtml(imageHtml(assets.logo, Math.min(LOGO_WIDTH, width), null, false), align) : "";
    case "signature":
      return assets.signature
        ? alignedHtml(imageHtml(assets.signature, Math.min(SIGNATURE_WIDTH, width), null, false), align)
        : "";
    case "header": {
      const text = contentOf(content, { ...block, type: "header" }).text[language];
      return text ? `<h1 style="margin:0;${textCss(styleOf(layout, "header", block), "header")}">${escapeHtml(text)}</h1>` : "";
    }
    case "text": {
      const doc = contentOf(content, { ...block, type: "text" }).text[language];
      return isRichTextEmpty(doc) ? "" : richHtml(styleOf(layout, "text", block), "text", doc);
    }
    case "textgrid": {
      const cells = contentOf(content, { ...block, type: "textgrid" }).cells.filter(
        (c) => !isRichTextEmpty(c[language])
      );
      if (cells.length === 0) return "";
      const gap = layout.gridSpacing.horizontal;
      const widths = equalWidths(width, cells.length, gap);
      const style = styleOf(layout, "textgrid", block);
      return columnsHtml(
        cells.map((c, i) => ({ width: widths[i], html: richHtml(style, "textgrid", c[language]) })),
        gap,
        width
      );
    }
    case "image": {
      const picture = contentOf(content, { ...block, type: "image" }).picture;
      const image = picture ? assets.pictures[pictureKey(picture)] : null;
      return image ? imageHtml(image, width) : "";
    }
    case "gallery": {
      const gallery = contentOf(content, { ...block, type: "gallery" });
      // Regularised: every picture the same square (one whose square
      // couldn't be made keeps its own shape).
      const images = gallery.pictures
        .map((p) => assets.pictures[pictureKey(p)])
        .filter((i): i is MailImage => Boolean(i))
        .map((i) => (gallery.regular && i.square ? { src: i.square, alt: i.alt } : i));
      if (images.length === 0) return "";
      const gap = layout.gridSpacing.horizontal;
      const widths = equalWidths(width, images.length, gap);
      // A gallery stays side by side on a phone, each image shrinking.
      const cells = images.map((image, i) => {
        const percent = Math.floor((widths[i] / width) * 100);
        const cell = `<td width="${percent}%" valign="top" style="width:${percent}%;">${imageHtml(image, widths[i])}</td>`;
        return i === 0 ? cell : `<td width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td>${cell}`;
      });
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;"><tr>${cells.join("")}</tr></table>`;
    }
    case "artwork": {
      const artworkId = contentOf(content, { ...block, type: "artwork" }).artworkId;
      const artwork = artworkId ? assets.artworks[artworkId] : null;
      if (!artwork) return "";
      const lines = [
        `<p style="margin:0 0 6px 0;${textCss(layout.textStyles.text, "text", 2)};font-weight:bold;">${escapeHtml(artwork.title)}</p>`,
        ...artwork.details.map(
          (d) => `<p style="margin:0;${textCss(layout.textStyles.text, "text", -1)}">${escapeHtml(d)}</p>`
        ),
        artwork.price
          ? `<p style="margin:10px 0 0 0;${textCss(layout.textStyles.text, "text")}">${escapeHtml(formatPrice(artwork.price, language))}</p>`
          : "",
      ].join("");
      if (!artwork.image) return lines;
      const imageWidth = Math.floor((width - ARTWORK_GAP) / 3);
      return columnsHtml(
        [
          { width: imageWidth, html: imageHtml(artwork.image, imageWidth, artwork.url) },
          { width: width - imageWidth - ARTWORK_GAP, html: lines },
        ],
        ARTWORK_GAP,
        width
      );
    }
    case "button": {
      const button = contentOf(content, { ...block, type: "button" });
      const label = button.label[language];
      if (!label || !button.url) return "";
      const colour = button.colour ?? BUTTON_DEFAULT_COLOUR;
      const textColour = button.textColour ?? BUTTON_DEFAULT_TEXT_COLOUR;
      const font = mailFontStack(layout.textStyles.text.font ?? "arial");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}"><tr><td bgcolor="${colour}" style="border-radius:4px;background-color:${colour};"><a href="${escapeHtml(button.url)}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:${font};font-size:15px;line-height:1.2;font-weight:bold;color:${textColour};text-decoration:none;border-radius:4px;">${escapeHtml(label)}</a></td></tr></table>`;
    }
  }
}

// One row: its components at their widths, placed by the row's
// alignment. Widths are a share of the mail's inner width; if they and
// the gaps between them don't fit, they're shrunk to fit.
function rowHtml(input: MailHtmlInput, row: MailBlock[], settings: RowSettings, innerWidth: number): string {
  const gap = settings.between;
  const gaps = gap * (row.length - 1);
  let widths = row.map((b) => Math.round((innerWidth * blockWidthOf(b)) / 100));
  const total = widths.reduce((a, b) => a + b, 0);
  if (total + gaps > innerWidth) {
    const factor = (innerWidth - gaps) / total;
    widths = widths.map((w) => Math.floor(w * factor));
  }
  const inner = row.map((b, i) => blockHtml(input, b, widths[i], settings.horizontal));
  if (inner.every((html) => html === "")) return "";
  // The row's alignment places pictures, the Logo, Signature and Button
  // within their space; text always reads from the left, as on a page.
  const cells = inner.map((html, i) => {
    const align = TEXT_BLOCKS.has(row[i].type) ? "left" : settings.horizontal;
    return {
      width: widths[i],
      valign: settings.vertical,
      html: `<div align="${align}" style="text-align:${align};">${html}</div>`,
    };
  });
  return columnsHtml(cells, gap, innerWidth);
}

export function renderMailHtml(input: MailHtmlInput): string {
  const { layout, language, assets } = input;
  const { desktop, phone } = layout.margins;
  const innerWidth = MAIL_WIDTH - desktop.horizontal * 2;
  const surround = layout.surroundColor ?? "#f5f5f5";
  const background = layout.backgroundColor ?? "#ffffff";

  const rows = groupBlocksByRow(layout.blocks);
  const body: string[] = [];
  rows.forEach((row, i) => {
    const html = rowHtml(input, row, rowSettingsOf(layout, rowKey(row)), innerWidth);
    if (!html) return;
    const above = i > 0 && body.length > 0 ? rowSettingsOf(layout, rowKey(rows[i - 1])).below : 0;
    if (above > 0) {
      body.push(`<tr><td height="${above}" style="height:${above}px;font-size:0;line-height:0;">&nbsp;</td></tr>`);
    }
    body.push(`<tr><td align="${rowSettingsOf(layout, rowKey(row)).horizontal}">${html}</td></tr>`);
  });

  const footerCss = `font-family:${mailFontStack(layout.textStyles.text.font ?? "arial")};font-size:12px;line-height:1.6;color:#888888;`;
  const footerLines = [
    [assets.footer.name, ...assets.footer.address].filter(Boolean).map(escapeHtml).join(" · "),
    assets.footer.website
      ? `<a href="${escapeHtml(assets.footer.website.url)}" target="_blank" style="color:#888888;text-decoration:underline;">${escapeHtml(assets.footer.website.label)}</a>`
      : "",
    `<a href="${escapeHtml(input.unsubscribeUrl)}" target="_blank" style="color:#888888;text-decoration:underline;">${FOOTER_LABELS[language].unsubscribe}</a>`,
  ].filter(Boolean);

  // Shown after the subject in the inbox; the padding after it stops the
  // mail's own text being pulled in behind it.
  const preheader = input.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preview)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(input.subject)}</title>
<style>
body{margin:0;padding:0;}
table{border-collapse:collapse;}
img{-ms-interpolation-mode:bicubic;}
@media only screen and (max-width:${PHONE_BREAKPOINT}px){
.mail-pad{padding:${phone.vertical}px ${phone.horizontal}px!important;}
.row{width:100%!important;}
.col{display:block!important;width:100%!important;}
.gap{display:block!important;width:100%!important;}
.fluid{width:100%!important;max-width:100%!important;height:auto!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${surround};">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${surround}" style="width:100%;background-color:${surround};">
<tr><td align="center" style="padding:24px 0;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${MAIL_WIDTH}" align="center"><tr><td><![endif]-->
<div style="max-width:${MAIL_WIDTH}px;margin:0 auto;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${background}" style="width:100%;background-color:${background};">
<tr><td class="mail-pad" style="padding:${desktop.vertical}px ${desktop.horizontal}px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
${body.join("\n")}
<tr><td style="padding-top:32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-top:1px solid #e5e5e5;">
<tr><td align="center" style="padding-top:16px;${footerCss}">${footerLines.map((l) => `<div>${l}</div>`).join("")}</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
