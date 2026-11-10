import type { Metadata } from "next";
import SignupForm from "@/components/signup/SignupForm";
import SignupFrame from "@/components/signup/SignupFrame";
import { markSignupLinkOpened, readSignupLink } from "@/lib/signupRecords";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign up — Je t'envoie ça", robots: { index: false } };

// A sign-up link's page (2026-11-10, Craig's request), at
// www.jetenvoieca.com/signup/<token>: the offer, then the person's
// details and password, then Stripe to pay (SignupForm). Public — the
// token is what lets them in.
export default async function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await readSignupLink(token);

  if (link.state !== "OPEN") {
    return (
      <SignupFrame title="Sign up">
        <p className="text-neutral-600">
          {link.state === "COMPLETED"
            ? "This link has already been used to sign up. If that was you, log in with the email and password you chose."
            : link.state === "EXPIRED"
              ? "This link has expired. Please get in touch and we'll send you a new one."
              : "This link isn't valid. Please check you have the whole address, or get in touch."}
        </p>
      </SignupFrame>
    );
  }

  await markSignupLinkOpened(link.offer.linkId);
  return (
    <SignupFrame title="Sign up">
      <SignupForm token={token} offer={link.offer} />
    </SignupFrame>
  );
}
