"use server";

import { db } from "@/lib/db";
import { getPlatformStripeClient } from "@/lib/platformStripe";
import { hashPassword } from "@/lib/passwords";
import { passwordProblem } from "@/lib/passwordRules";
import { ADD_ONS, toPence } from "@/lib/plans";
import { readSignupLink } from "@/lib/signupRecords";
import { signupLinkUrl } from "@/lib/signupLinks";

// The sign-up page's action (2026-11-10) — deliberately public, like the
// website's enquiry and purchase actions: the link's token is what lets
// it in, and it only ever acts on that link. It keeps what the person
// gave on the link and sends them to Stripe to pay; the client, site and
// login are made once Stripe confirms the payment (platform webhook).

export type SignupDetails = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

// Checks the details and starts paying: returns Stripe's page to go to.
export async function startSignupCheckout(
  token: string,
  details: SignupDetails,
): Promise<{ url: string } | { error: string }> {
  const link = await readSignupLink(token);
  if (link.state === "COMPLETED") return { error: "This link has already been used to sign up." };
  if (link.state !== "OPEN") return { error: "This link isn't valid any more." };
  const { offer } = link;

  const name = details.name.trim();
  const email = details.email.trim().toLowerCase();
  const phone = details.phone.trim();
  if (!name) return { error: "Please give your name." };
  if (name.length > 200) return { error: "That name is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  if (phone.length > 50) return { error: "That phone number is too long." };
  const problem = passwordProblem(details.password);
  if (problem) return { error: problem };
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: "There's already an account with that email — please use another, or contact us." };
  }

  const { signupStripeMode: mode } = await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { signupStripeMode: true },
  });
  const currency = offer.currency.toLowerCase();
  const monthly = (productName: string, price: string, quantity: number) => ({
    price_data: {
      currency,
      unit_amount: toPence(price) ?? 0,
      recurring: { interval: "month" as const },
      product_data: { name: productName },
    },
    quantity,
  });

  const url = signupLinkUrl(token);
  const session = await getPlatformStripeClient(mode).checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    client_reference_id: offer.linkId,
    line_items: [
      monthly(`${offer.planName} plan`, offer.planPrice, 1),
      ...offer.addOns.map((a) =>
        monthly(ADD_ONS.find((o) => o.key === a.addOn)?.label ?? a.addOn, a.monthlyPrice, a.quantity),
      ),
    ],
    metadata: { signupLinkId: offer.linkId },
    subscription_data: { metadata: { signupLinkId: offer.linkId } },
    success_url: `${url}/done`,
    cancel_url: url,
  });
  if (!session.url) return { error: "Payment couldn't be started — please try again." };

  await db.signupLink.update({
    where: { id: offer.linkId },
    data: {
      signupName: name,
      signupEmail: email,
      signupPhone: phone || null,
      passwordHash: await hashPassword(details.password),
      stripeMode: mode,
      stripeCheckoutSessionId: session.id,
    },
  });
  return { url: session.url };
}
