// How an invoice number is written everywhere — on the PDF, in emails
// and in the app: seven digits, e.g. 0000123. A plain function (not a
// server action) so client components can use it too.
export function formatInvoiceNumber(number: number): string {
  return String(number).padStart(7, "0");
}
