import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listExpenses } from "@/lib/actions/expenses";
import { getExpenseCategories } from "@/lib/actions/purchaseSettings";
import ExpensesView from "@/components/ExpensesView";

// Same reasoning as Sales/Galleries/Customers (see their page.tsx files,
// 2026-08-16) — ExpensesView calls router.refresh() after add/edit/
// delete, which needs this route to never be served from the Full Route
// Cache, or a change wouldn't show until a hard reload.
export const dynamic = "force-dynamic";

export default async function PurchasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true },
  });
  if (!site) notFound();

  const [expenses, categories] = await Promise.all([
    listExpenses(site.artistId),
    getExpenseCategories(site.artistId),
  ]);

  return (
    <ExpensesView siteId={id} artistId={site.artistId} expenses={expenses} categories={categories} />
  );
}
