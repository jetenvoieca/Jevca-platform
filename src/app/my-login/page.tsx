import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

// Your login (2026-10-26): who you're logged in as, and changing your
// own password. Reached from "Your login" above Log out.
export default async function MyLoginPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back
        </Link>
        <ChangePasswordForm name={me.name} email={me.email} />
      </div>
    </div>
  );
}
