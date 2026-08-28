// Reference price = (first width × height found in the Size preset text)
// × the selected Type's Ref value (2026-08-28). Deliberately never
// stored anywhere — it's derived fresh every time Size or Type changes,
// from whatever Ref value is currently set in Settings, so tuning a
// Type's Ref value later updates every artwork of that type immediately
// rather than leaving old artworks with a stale figure. Same
// "calculated, not stored" convention already used for the Presentation
// tab's instalment-price preview.

// Pulls the first "NN x NN" pair out of a Size preset string — e.g.
// "27 x 27 cms ( 30 x 30 cms framed )" → 27 × 27 = 729, correctly
// ignoring the framed dimensions that follow in brackets since those
// always come second. Accepts "x" or "×", any whitespace, and decimals.
export function computeArea(sizeText: string | null | undefined): number | null {
  if (!sizeText) return null;
  const match = sizeText.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const a = parseFloat(match[1]);
  const b = parseFloat(match[2]);
  if (!a || !b) return null;
  return a * b;
}

export function computeReferencePrice(
  sizeText: string | null | undefined,
  refValue: number | null | undefined
): number | null {
  const area = computeArea(sizeText);
  if (area == null || !refValue) return null;
  return area * refValue;
}
