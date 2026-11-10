import type { Metadata } from "next";
import SignupFrame from "@/components/signup/SignupFrame";
import SignupWaiting from "@/components/signup/SignupWaiting";
import { readSignupLink } from "@/lib/signupRecords";
import { APP_URL } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Welcome — Je t'envoie ça", robots: { index: false } };

// Where Stripe sends the person once they've paid (2026-11-10). Their
// client, site and login are made when Stripe confirms the payment —
// usually within seconds — so until then it says so and looks again.
export default async function SignupDonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await readSignupLink(token);

  if (link.state === "COMPLETED") {
    return (
      <SignupFrame title="Welcome">
        <p className="mb-6 text-neutral-600">
          Thank you — your site is ready. Log in with the email and password you chose; we&apos;ve sent you an
          email with the details too.
        </p>
        <a
          href={`${APP_URL}/login`}
          className="inline-block rounded-[4px] bg-neutral-900 px-6 py-2.5 text-white hover:bg-neutral-700"
        >
          Log in
        </a>
      </SignupFrame>
    );
  }
  if (link.state !== "OPEN") {
    return (
      <SignupFrame title="Sign up">
        <p className="text-neutral-600">This link isn&apos;t valid. Please get in touch.</p>
      </SignupFrame>
    );
  }
  return (
    <SignupFrame title="Thank you">
      <SignupWaiting />
    </SignupFrame>
  );
}
