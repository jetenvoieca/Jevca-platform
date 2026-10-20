"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import type { CurationWorkPresentation } from "@/lib/actions/curations";
import { isValidInstalmentCount, splitIntoInstalments } from "@/lib/saleMath";
import { SITE_FONT_FAMILY } from "@/lib/siteFontFaces";
import { DEFAULT_PRESENTATION, fillLabel, formatMoney, type PresentationSettings } from "@/lib/presentationTemplate";
import FadeImage from "@/components/FadeImage";
import WorkEnquiryForm from "@/components/WorkEnquiryForm";
import WorkPaymentForm from "@/components/WorkPaymentForm";
import type { SiteForms } from "@/lib/siteData";

// A work's details as a visitor sees them when they open it on a page
// (2026-10-19), drawn from a Presentation Template's settings (see
// lib/presentationTemplate.ts): the picture (and the work's other
// pictures beneath it, to switch between), the title and details, the
// price, Purchase / Pay in instalments, the instalment terms, Enquire and
// where it can be seen; beside them the medium and description. Enquire
// slides the enquiry form (WorkEnquiryForm) in over the medium and
// description; Purchase and Pay in instalments the payment form
// (WorkPaymentForm) when the site takes payments, otherwise they open an
// email to the artist. Shared by the
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
  site?: SiteForms | null;
}) {
  const { colours, show, labels } = settings;
  // Which is showing: the words and buttons, or one of the forms over them.
  const [panel, setPanel] = useState<"words" | "enquiry" | "full" | "instalments">("words");
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
      minHeight: settings.buttonHeight,
      borderRadius: settings.buttonRounding,
      fontFamily: textFont,
      // Purchase and Pay in instalments (not `wide`) are a little smaller
      // and always side by side under the picture — on a narrow window
      // their words go onto two lines rather than the buttons stacking.
      fontSize: Math.round(settings.textSize * (wide ? 0.8 : 0.7)),
    };
    const className = `${
      wide ? "w-full whitespace-nowrap px-6 tracking-[0.2em]" : "min-w-0 flex-auto px-3 tracking-[0.15em]"
    } inline-flex items-center justify-center py-1 text-center uppercase transition-opacity hover:opacity-90`;
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
  // The hidden ones of the words and the forms take no space, except
  // beside the picture on a desktop (see below).
  const hiddenLayer = side ? "absolute inset-x-0 top-0 md:static" : "absolute inset-x-0 top-0";
  // A form, with Back above it to return to the words (the close cross
  // closes the whole window).
  const formLayer = (open: boolean, form: ReactNode) => (
    <div
      inert={!open}
      className={`col-start-1 row-start-1 flex min-w-0 flex-col gap-3 self-start transition-all duration-500 ease-out ${
        open ? "" : `invisible translate-x-full opacity-0 ${hiddenLayer}`
      }`}
    >
      <button
        type="button"
        onClick={() => setPanel("words")}
        className="self-start uppercase tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100"
        style={{ color: colours.text, fontSize: Math.round(settings.textSize * 0.75) }}
      >
        {labels.back}
      </button>
      {form}
    </div>
  );
  // Bought online when the site takes payments — and in the admin's
  // previews (no `site`), so the payment form can be seen there.
  const buyOnline = data.available && priced && (!site || site.salesEnabled);
  const canBuyFull = buyOnline && show.purchase;
  const canBuyInstalments = buyOnline && show.instalments && perInstalment != null;

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
      {/* The picture, the work's other pictures, its title and details,
          then the price, Purchase / Pay in instalments, the instalment
          terms, Enquire and where it can be seen (2026-10-20, Craig's
          mock-up). */}
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
        {/* The details, price and buttons, a little narrower than the
            picture, all lined up on the left. */}
        <div className="mt-6 flex w-4/5 flex-col gap-6 self-center">
          {((show.edition && editionLine) || (show.size && data.size)) && (
            <div style={{ fontSize: settings.textSize }}>
              {show.edition && editionLine && <p>{editionLine}</p>}
              {show.size && data.size && <p>{data.size}</p>}
            </div>
          )}
          {show.price && priced && (
            <p style={{ fontSize: settings.textSize }}>{formatMoney(price, data.priceCurrency)}</p>
          )}

          {data.available ? (
            <>
              {priced && (show.purchase || (show.instalments && perInstalment != null)) && (
                <div className="flex gap-3">
                  {show.purchase &&
                    button(
                      fillLabel(labels.purchase, values),
                      colours.purchaseBackground,
                      colours.purchaseText,
                      false,
                      canBuyFull ? () => setPanel("full") : undefined,
                    )}
                  {show.instalments &&
                    perInstalment != null &&
                    button(
                      fillLabel(labels.instalments, values),
                      colours.instalmentsBackground,
                      colours.instalmentsText,
                      false,
                      canBuyInstalments ? () => setPanel("instalments") : undefined,
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

          {(show.enquire || (show.location && data.viewingLocation)) && (
            <div className="flex flex-col gap-3">
              {show.enquire &&
                button(fillLabel(labels.enquire, values), colours.enquireBackground, colours.enquireText, true, () =>
                  setPanel("enquiry"),
                )}
              {show.location && data.viewingLocation && (
                <p style={{ color: colours.muted, fontSize: small }}>{fillLabel(labels.location, values)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The medium and description, and the forms, which slide in over
          them from the top of the column. Beside the picture on a desktop
          they all share one space as tall as the tallest, so the window
          keeps its size when a form opens; elsewhere the hidden ones are
          lifted out of the way. A form's Back sits above it, clear of
          the close cross. */}
      <div className="relative grid min-w-0 overflow-hidden">
        <div
          inert={panel !== "words"}
          className={`col-start-1 row-start-1 flex min-w-0 flex-col gap-6 transition-all duration-500 ease-out ${
            panel !== "words" ? `invisible -translate-x-1/4 opacity-0 ${hiddenLayer}` : ""
          }`}
        >
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
        </div>

        {formLayer(
          panel === "enquiry",
          <WorkEnquiryForm data={data} settings={settings} site={site} active={panel === "enquiry"} />,
        )}
        {canBuyFull &&
          formLayer(
            panel === "full",
            <WorkPaymentForm
              data={data}
              settings={settings}
              site={site}
              active={panel === "full"}
              instalments={false}
            />,
          )}
        {canBuyInstalments &&
          formLayer(
            panel === "instalments",
            <WorkPaymentForm
              data={data}
              settings={settings}
              site={site}
              active={panel === "instalments"}
              instalments
            />,
          )}
      </div>
    </div>
  );
}
