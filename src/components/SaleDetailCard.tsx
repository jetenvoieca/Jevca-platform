import type { PurchaseDetail } from "@/lib/actions/payments";

function formatMoney(amount: string, currency: string) {
  const n = parseFloat(amount);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-sm text-neutral-800">{value}</dd>
    </div>
  );
}

export default function SaleDetailCard({
  purchase,
  artworkType,
  artworkSize,
  artworkGroup,
  artworkMedium,
}: {
  purchase: PurchaseDetail;
  artworkType: string | null;
  artworkSize: string | null;
  artworkGroup: string | null;
  artworkMedium: string | null;
}) {
  // The next instalment still owed, if this sale was abandoned partway
  // through an instalment plan — irrelevant (and absent) for a fully
  // Completed sale, since nothing's left due.
  const nextDue = purchase.payments.find((p) => p.status === "DUE");

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-400">
        {purchase.status === "COMPLETED" ? "Completed" : "Abandoned"}
        {purchase.closedAt ? ` on ${new Date(purchase.closedAt).toLocaleDateString()}` : ""} — a
        past transaction, shown for reference only.
      </p>

      <dl className="grid grid-cols-2 gap-3">
        <Field label="Type" value={artworkType} />
        <Field label="Size" value={artworkSize} />
        <Field label="Group" value={artworkGroup} />
        <Field label="Medium" value={artworkMedium} />

        <div className="col-span-2 border-t border-neutral-100 pt-3">
          <dt className="text-xs uppercase tracking-wide text-neutral-400">
            {purchase.type === "FULL" ? "Price paid" : "Total price"}
          </dt>
          <dd className="text-sm text-neutral-800">
            {formatMoney(purchase.totalAmount, purchase.currency)}
            {purchase.type === "INSTALMENTS" ? ` (${purchase.instalmentCount} instalments)` : ""}
          </dd>
        </div>

        {nextDue && (
          <>
            <Field
              label="Next instalment due"
              value={nextDue.dueDate ? new Date(nextDue.dueDate).toLocaleDateString() : "—"}
            />
            <Field label="Next instalment amount" value={formatMoney(nextDue.amount, nextDue.currency)} />
          </>
        )}

        <div className="col-span-2 border-t border-neutral-100 pt-3">
          <Field label="Customer name" value={purchase.buyerName} />
        </div>
        <div className="col-span-2">
          <Field label="Customer email" value={purchase.buyerEmail} />
        </div>
        <div className="col-span-2">
          <Field label="Sale source" value={purchase.source} />
        </div>
      </dl>

      {purchase.payments.length > 0 && (
        <div className="border-t border-neutral-100 pt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Payment history</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="pb-1 font-normal">#</th>
                <th className="pb-1 font-normal">Amount</th>
                <th className="pb-1 font-normal">Status</th>
                <th className="pb-1 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchase.payments.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="py-1.5 text-neutral-500">{p.sequence}</td>
                  <td className="py-1.5">{formatMoney(p.amount, p.currency)}</td>
                  <td className="py-1.5">
                    <span
                      className={
                        p.status === "PAID"
                          ? "text-green-600"
                          : p.status === "FAILED"
                            ? "text-red-600"
                            : "text-neutral-500"
                      }
                    >
                      {p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Due"}
                    </span>
                  </td>
                  <td className="py-1.5 text-neutral-500">
                    {p.paidDate
                      ? new Date(p.paidDate).toLocaleDateString()
                      : p.dueDate
                        ? new Date(p.dueDate).toLocaleDateString()
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
