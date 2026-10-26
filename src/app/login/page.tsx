import { db } from "@/lib/db";
import LoginForm from "@/components/LoginForm";
import SetUpAdminForm from "@/components/SetUpAdminForm";

export const dynamic = "force-dynamic";

// Log in by email and password (2026-10-26). Until the admin account
// exists, this sets it up instead (see setUpAdmin).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const hasAdmin = (await db.user.count({ where: { role: "ADMIN" } })) > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      {hasAdmin ? (
        <LoginForm next={next && next.startsWith("/") ? next : "/"} />
      ) : (
        <SetUpAdminForm />
      )}
    </div>
  );
}
