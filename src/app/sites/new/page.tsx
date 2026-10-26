import Link from "next/link";
import { getArtistsForPicker } from "@/lib/actions";
import NewSiteForm from "./NewSiteForm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";

export default async function NewSitePage() {
  // Admin only (2026-10-26).
  if ((await getCurrentUser())?.role !== "ADMIN") redirect("/");
  const artists = await getArtistsForPicker();

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Back to Sites
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-semibold text-neutral-900">
        Add New Site
      </h1>
      <NewSiteForm artists={artists} />
    </main>
  );
}
