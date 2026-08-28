import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getExpenseCategories } from "@/lib/actions/purchaseSettings";
import ExpenseCategoriesCard from "@/components/ExpenseCategoriesCard";

export const dynamic = "force-dynamic";

export default async function PurchaseSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: { artistId: true },
  });
  if (!site) notFound();

  const categories = await getExpenseCategories(site.artistId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Purchases Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Manage the category list offered when recording a purchase.
      </p>
      <ExpenseCategoriesCard siteId={id} artistId={site.artistId} categories={categories} />
    </div>
  );
}
