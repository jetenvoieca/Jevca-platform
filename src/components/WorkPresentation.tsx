"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { isValidInstalmentCount, splitIntoInstalments } from "@/lib/saleMath";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";
import { DEFAULT_PRESENTATION, fillLabel, type PresentationSettings } from "@/lib/presentationTemplate";
import FadeImage from "@/components/FadeImage";
import WorkEnquiryForm, { type EnquirySite } from "@/components/WorkEnquiryForm";

// A work's details as a visitor sees them when they open it on a page
// (2026-10-19), drawn from a Presentation Template's settings (see
// lib/presentationTemplate.ts): the picture (and the work's other
// pictures beneath it, to switch between), the title and details, then
// the medium, description, Purchase / Pay in instalments, the instalment
// terms, Enquire and where it can be seen. Enquire swaps the price and
// buttons for the enquiry form (WorkEnquiryForm); Purchase and Pay in
// instalments open an email to the artist for now (online buying comes
// later). Shared by the
// Presentation window (CurationWorkView) and Templates → Presentations'
// preview.

const PresentationContext = createContext<PresentationSettings>(DEFAULT_PRESENTATION);

// The template a page's works open with — its Page Style's.
export function PresentationProvider({ settings, children }: { settings: PresentationSettings; children: ReactNode }) {
  return <PresentationContext.Provider value={settings}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationSettings {
  return useContext(PresentationContext);
}

// Whole amounts without pence (£1,995), unless `pence` (£399.00).
export function formatMoney(n: number, currency: string, pence = false): string {
  const digits = pence || !Number.isInteger(n) ? 2 : 0;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(digits)}`;
  }
}

export default function WorkPresentation({
  data,
  settings,
  viewIndex,
  onView,
  onClose,
  site = null,
}: {
  data: CurationWorkPresentation;
  settings: PresentationSettings;
  viewIndex: number;
  onView: (index: number) => void;
  // The window's close cross, inside the card's top-right corner.
  onClose?: () => void;
  // Where the enquiry form sends from — the published site only.
  site?: EnquirySite | null;
}) {
  const { colours, show, labels } = settings;
  const [enquiring, setEnquiring] = useState(false);
  const viewed = data.images[viewIndex] ?? data.images[0] ?? null;
  const description = data.description ?? data.artworkDescription ?? "";
  const price = data.offeredPrice != null ? Number(data.offeredPrice) : null;
  const priced = price != null && price > 0;
  const count = data.defaultInstalmentCount;
  const perInstalment = priced && isValidInstalmentCount(count) ? splitIntoInstalments(price, count)[0] : null;
  const values = {
    count: String(count),
    amount: perInstalment != null ? formatMoney(perInstalment, data.priceCurrency, true) : "",
    location: data.viewingLocation ?? "",
  };
  const editionLine = [data.edition, data.type].filter(Boolean).join(" - ");

  const titleFont = SITE_FONT_FAMILY[settings.titleFont];
  const textFont = SITE_FONT_FAMILY[settings.textFont];
  const small = Math.round(settings.textSize * 0.9);

  // An email to the artist about this work, subject e.g. "Purchase: Rude".
  const mailto = (action: string) => {
    if (!data.enquiryEmail) return undefined;
    const subject = `${action}: ${data.catalogueName}`;
    const body = `Hello,\n\nI'm interested in "${data.catalogueName}"${priced ? ` (${formatMoney(price, data.priceCurrency)})` : ""}.\n\n`;
    return `mailto:${data.enquiryEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const button = (label: string, background: string, color: string, wide: boolean, onClick?: () => void) => {
    const style: CSSProperties = {
      background,
      color,
      borderRadius: settings.buttonRounding,
      fontFamily: textFont,
      fontSize: Math.round(settings.textSize * 0.8),
    };
    const className = `${wide ? "w-full" : "flex-1"} inline-flex min-h-14 items-center justify-center whitespace-nowrap px-6 py-4 text-center uppercase tracking-[0.2em] transition-opacity hover:opacity-90`;
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={className} style={style}>
          {label}
        </button>
      );
    }
    const href = mailto(label);
    return href ? (
      <a href={href} className={className} style={style}>
        {label}
      </a>
    ) : (
      <span className={className} style={style}>
        {label}
      </span>
    );
  };

  const side = settings.layout === "side";

  return (
    <div
      className={`relative flex flex-col gap-8 p-6 sm:p-8 ${side ? "md:grid md:items-start md:gap-12" : ""}`}
      style={{
        background: colours.background,
        border: settings.borderWidth > 0 ? `${settings.borderWidth}px solid ${colours.border}` : undefined,
        borderRadius: settings.rounding,
        color: colours.text,
        fontFamily: textFont,
        gridTemplateColumns: side ? `${settings.pictureShare}% 1fr` : undefined,
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 p-1 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: colours.text }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {/* The picture, the work's other pictures, its title and details. */}
      <div className="flex min-w-0 flex-col">
        {!viewed && (
          <div
            className="flex aspect-square w-full items-center justify-center text-sm"
            style={{ background: colours.border, color: colours.background }}
          >
            Picture
          </div>
        )}
        {viewed &&
          (viewed.kind === "VIDEO" ? (
            <video
              key={viewed.id}
              src={viewed.displayUrl}
              poster={viewed.posterUrl ?? undefined}
              controls
              className="max-h-[70vh] w-full bg-black object-contain"
            />
          ) : (
            <FadeImage
              src={viewed.displayUrl}
              alt={data.catalogueName}
              className="max-h-[70vh] w-full object-contain"
            />
          ))}
        {data.images.length > 1 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {data.images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onView(i)}
                className="overflow-hidden border-2"
                style={{ borderColor: i === viewIndex ? colours.text : "transparent" }}
              >
                <FadeImage
                  src={img.kind === "VIDEO" ? (img.posterUrl ?? img.url) : img.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        <h2
          className="mt-6 text-center font-light leading-tight"
          style={{ fontFamily: titleFont, fontSize: settings.titleSize }}
        >
          {data.catalogueName}
        </h2>
        {((show.edition && editionLine) || (show.size && data.size)) && (
          <div className="mt-4" style={{ fontSize: settings.textSize }}>
            {show.edition && editionLine && <p>{editionLine}</p>}
            {show.size && data.size && <p>{data.size}</p>}
          </div>
        )}
      </div>

      {/* The words and the buttons. */}
      <div className="flex min-w-0 flex-col gap-6">
        {show.medium && data.medium && (
          <p className="italic" style={{ color: colours.muted, fontSize: small, lineHeight: 1.6 }}>
            {data.medium}
          </p>
        )}
        {show.description && description && (
          <p
            className="whitespace-pre-line break-words"
            style={{ fontSize: settings.textSize, lineHeight: settings.lineSpacing }}
          >
            {description}
          </p>
        )}
        {enquiring && <WorkEnquiryForm data={data} settings={settings} site={site} />}
        {!enquiring && show.price && priced && (
          <p style={{ fontSize: settings.textSize }}>{formatMoney(price, data.priceCurrency)}</p>
        )}

        {enquiring ? null : data.available ? (
          <>
            {priced && (show.purchase || (show.instalments && perInstalment != null)) && (
              <div className="flex flex-wrap gap-4">
                {show.purchase &&
                  button(fillLabel(labels.purchase, values), colours.purchaseBackground, colours.purchaseText, false)}
                {show.instalments &&
                  perInstalment != null &&
                  button(
                    fillLabel(labels.instalments, values),
                    colours.instalmentsBackground,
                    colours.instalmentsText,
                    false,
                  )}
              </div>
            )}
            {show.instalmentTerms && perInstalment != null && (
              <p style={{ color: colours.muted, fontSize: small }}>
                {fillLabel(labels.instalmentTerms, values)}
                {data.releaseMessage && ` · ${data.releaseMessage}`}
              </p>
            )}
          </>
        ) : (
          labels.sold && (
            <p className="uppercase tracking-[0.2em]" style={{ color: colours.muted, fontSize: small }}>
              {labels.sold}
            </p>
          )
        )}

        {!enquiring && (show.enquire || (show.location && data.viewingLocation)) && (
          <div className="flex flex-col gap-3">
            {show.enquire &&
              button(fillLabel(labels.enquire, values), colours.enquireBackground, colours.enquireText, true, () =>
                setEnquiring(true),
              )}
            {show.location && data.viewingLocation && (
              <p style={{ color: colours.muted, fontSize: small }}>{fillLabel(labels.location, values)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
