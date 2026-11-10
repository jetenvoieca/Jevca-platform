import Link from "next/link";
import ResetPasswordForm from "@/components/ResetPasswordForm";
import { isPasswordResetUsable } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

// A "Forgot your password?" link's page (2026-11-10) — see resetPassword.
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const usable = await isPasswordResetUsable(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      {usable ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 text-sm shadow-sm">
          <h1 className="mb-2 text-lg font-semibold text-neutral-900">JEVCA Studio</h1>
          <p className="mb-4 text-neutral-600">This link has expired or been used.</p>
          <Link href="/login/forgot" className="text-neutral-900 underline">
            Ask for a new one
          </Link>
        </div>
      )}
    </div>
  );
}
