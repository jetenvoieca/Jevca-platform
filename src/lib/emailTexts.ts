// Email texts (2026-10-27, Craig's request): the subject and message of
// every email the app writes for a client — invoices, receipts,
// statements and certificates — set per client in Settings → Financial
// (EmailTextsCard) and kept in Artist.emailTexts. A client who hasn't
// changed one has the default below, which Settings shows as the text
// itself, so what's on screen is always what's sent. Each email can still
// be edited before it's sent.
//
// Markers in braces, e.g. {first name}, are filled in from the sale. A
// line whose marker has nothing to fill it (e.g. {payment link} on an
// invoice paid by transfer) is left out of the email. Plain module, not
// "use server", so Settings and the email builders share it.

export type EmailTextKey =
  | "invoiceGallery"
  | "invoiceBuyer"
  | "receiptGallery"
  | "receiptBuyer"
  | "chargeInvoice"
  | "chargeReceipt"
  | "statement"
  | "certificate";

export type EmailText = { subject: string; body: string };

type EmailTextDefinition = EmailText & {
  label: string;
  // When it's used, shown under its name in Settings.
  detail: string;
  markers: string[];
};

const SIGN_OFF = "Many thanks,\n{artist name}";

const INVOICE_PAYMENT = [
  "I enclose our invoice for your attention.",
  "",
  "Payment by transfer to our account on the invoice.",
  "Or pay securely online: {payment link}",
].join("\n");

const RECEIPT_THANKS = "Thank you for the payment — I enclose our receipt for your records.";

const SALE_MARKERS = ["{first name}", "{works}", "{invoice number}", "{artist name}"];

export const EMAIL_TEXTS: Record<EmailTextKey, EmailTextDefinition> = {
  invoiceGallery: {
    label: "Invoice — gallery",
    detail: "An unpaid invoice for works sold by a gallery.",
    markers: [...SALE_MARKERS, "{payment link}"],
    subject: 'Sale "{works}"',
    body: ["Dear {first name},", "", "It's great that you have sold {works}.", "", INVOICE_PAYMENT, "", SIGN_OFF].join("\n"),
  },
  invoiceBuyer: {
    label: "Invoice — buyer",
    detail: "An unpaid invoice for works bought by anyone else.",
    markers: [...SALE_MARKERS, "{payment link}"],
    subject: 'Sale "{works}"',
    body: ["Dear {first name},", "", "Thank you for your purchase of {works}.", "", INVOICE_PAYMENT, "", SIGN_OFF].join(
      "\n",
    ),
  },
  receiptGallery: {
    label: "Receipt — gallery",
    detail: "A paid invoice's receipt, for works sold by a gallery.",
    markers: SALE_MARKERS,
    subject: 'Sale "{works}"',
    body: ["Dear {first name},", "", "It's great that you have sold {works}.", "", RECEIPT_THANKS, "", SIGN_OFF].join("\n"),
  },
  receiptBuyer: {
    label: "Receipt — buyer",
    detail: "A paid invoice's receipt, for works bought by anyone else.",
    markers: SALE_MARKERS,
    subject: 'Sale "{works}"',
    body: ["Dear {first name},", "", "Thank you for your purchase of {works}.", "", RECEIPT_THANKS, "", SIGN_OFF].join(
      "\n",
    ),
  },
  chargeInvoice: {
    label: "Invoice — framing or delivery",
    detail: "An unpaid invoice for a framing or delivery charge on its own.",
    markers: [...SALE_MARKERS, "{charge}", "{payment link}"],
    subject: 'Sale "{works} {charge} charge"',
    body: ["Dear {first name},", "", "This is for the {charge} of {works}.", "", INVOICE_PAYMENT, "", SIGN_OFF].join("\n"),
  },
  chargeReceipt: {
    label: "Receipt — framing or delivery",
    detail: "The receipt for a framing or delivery charge on its own.",
    markers: [...SALE_MARKERS, "{charge}"],
    subject: 'Sale "{works} {charge} charge"',
    body: ["Dear {first name},", "", "This is for the {charge} of {works}.", "", RECEIPT_THANKS, "", SIGN_OFF].join("\n"),
  },
  statement: {
    label: "Statement",
    detail: "A gallery's statement of works sold and still to be paid for.",
    markers: [
      "{first name}",
      "{location}",
      "{date}",
      "{count}",
      "{total owed}",
      "{works owed}",
      "{payment link}",
      "{artist name}",
    ],
    subject: "Statement — {location} — {date}",
    body: [
      "Dear {first name},",
      "",
      "Please find attached our statement of works sold at {location} and still to be paid for — {count}, {total owed} in all.",
      "",
      "{works owed}",
      "",
      "Payment by transfer to our account on the statement.",
      "Or pay the whole statement securely online: {payment link}",
      "",
      SIGN_OFF,
    ].join("\n"),
  },
  certificate: {
    label: "Certificate of Authenticity",
    detail: "Sending a sale's Certificate of Authenticity.",
    markers: ["{first name}", "{works}", "{artist name}"],
    subject: 'Certificate of Authenticity — "{works}"',
    body: [
      "Dear {first name},",
      "",
      "Please find attached the Certificate of Authenticity for {works}.",
      "",
      SIGN_OFF,
    ].join("\n"),
  },
};

export const EMAIL_TEXT_KEYS = Object.keys(EMAIL_TEXTS) as EmailTextKey[];

export function isEmailTextKey(key: string): key is EmailTextKey {
  return key in EMAIL_TEXTS;
}

// The client's texts as used: each one they've changed, else its default.
export function readEmailTexts(saved: unknown): Record<EmailTextKey, EmailText> {
  const stored = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  return Object.fromEntries(
    EMAIL_TEXT_KEYS.map((key) => {
      const value = stored[key] as Partial<EmailText> | undefined;
      const own = value && typeof value.subject === "string" && typeof value.body === "string";
      return [key, own ? { subject: value.subject!, body: value.body! } : defaultEmailText(key)];
    }),
  ) as Record<EmailTextKey, EmailText>;
}

export function defaultEmailText(key: EmailTextKey): EmailText {
  const { subject, body } = EMAIL_TEXTS[key];
  return { subject, body };
}

// Names in a sentence: "A", "A and B", "A, B and C".
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const MARKER = /\{([a-z ]+)\}/g;

// Fills one line's markers; null when one of them has nothing to fill it,
// so the line is left out. Braces that aren't a known marker stay as typed.
function fillLine(line: string, values: Record<string, string>): string | null {
  let missing = false;
  const filled = line.replace(MARKER, (whole, name: string) => {
    if (!(name in values)) return whole;
    if (!values[name]) missing = true;
    return values[name];
  });
  return missing ? null : filled;
}

// A text with its markers filled in (`values` keyed by marker name, e.g.
// "first name"). Lines left out never leave two blank lines together.
export function fillEmailText(text: EmailText, values: Record<string, string>): EmailText {
  const lines: string[] = [];
  for (const line of text.body.split("\n")) {
    const filled = fillLine(line, values);
    if (filled === null) continue;
    if (filled.trim() === "" && lines.length > 0 && lines[lines.length - 1].trim() === "") continue;
    lines.push(filled);
  }
  return {
    subject: (fillLine(text.subject, values) ?? text.subject.replace(MARKER, "")).trim(),
    body: lines.join("\n").trim(),
  };
}
