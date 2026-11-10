import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const dynamic = "force-dynamic";

// "Forgot your password?" (2026-11-10) — see requestPasswordReset.
export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <ForgotPasswordForm />
    </div>
  );
}
