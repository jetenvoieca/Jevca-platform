import { Resend } from "resend";
import { db } from "@/lib/db";
import { getPlatformStripeClient } from "@/lib/platformStripe";
import type { StripeMode } from "@/lib/stripe";
import { generateUniqueEmailSlug } from "@/lib/emailSlug";
import { applyThemeToSite } from "@/lib/siteThemeApply";
import { cleanThemeEntries } from "@/lib/siteThemes";
import { ADD_ONS, monthlyTotalPence } from "@/lib/plans";
import { formatMoney } from "@/lib/currencies";
import { APP_URL } from "@/lib/appUrl";

// Finishing a sign-up (2026-11-10, Craig's request) once Stripe confirms
// the payment (checkout.session.completed on the platform webhook): from
// what the person gave on their link (SignupLink), the client (Artist),
// their site — on the link's plan and theme, at the link's prices, billed
// from its new Stripe subscription — its pages from the theme, and their
// login. A new client has no curations, so when the theme has curation
// pages (e.g. a portfolio) one empty curation, "First page", is made for
// it to show (Craig, 10 Nov) — the artist renames it and adds more pages
// from it in the Artist App. Then a welcome email to them, an email to Craig and an alert on
// the Dashboard. Plain server code, called only by the webhook.
//
// Safe to receive more than once: the link is claimed as completed in the
// same transaction that makes the records, so a repeated event finds it
// done and stops. If anything fails, nothing is kept and the webhook
// answers with an error, so Stripe tries again.

export const SIGNUP_ALERT_TYPE = "SIGNUP_COMPLETED";

const LINK_SELECT = {
  id: true,
  completedAt: true,
  stripeMode: true,
  planId: true,
  siteThemeId: true,
  planPrice: true,
  currency: true,
  signupName: true,
  signupEmail: true,
  signupPhone: true,
  passwordHash: true,
  plan: { select: { name: true } },
  siteTheme: { select: { entries: true } },
  addOns: { select: { addOn: true, quantity: true, monthlyPrice: true } },
} as const;

const FIRST_CURATION_NAME = "First page";

export async function completeSignup(sessionId: string, mode: StripeMode): Promise<void> {
  const link = await db.signupLink.findUnique({ where: { stripeCheckoutSessionId: sessionId }, select: LINK_SELECT });
  if (!link) {
    console.warn(`Sign-up: no link for Checkout session ${sessionId} — ignoring.`);
    return;
  }
  if (link.completedAt) return;
  if (link.stripeMode !== mode) {
    console.warn(`Sign-up: session ${sessionId} came in ${mode}, the link was paid in ${link.stripeMode} — ignoring.`);
    return;
  }
  if (!link.signupName || !link.signupEmail) {
    throw new Error(`Sign-up: link ${link.id} has no details from its page.`);
  }

  const session = await getPlatformStripeClient(mode).checkout.sessions.retrieve(sessionId);
  if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) {
    console.warn(`Sign-up: session ${sessionId} isn't paid yet (${session.status}, ${session.payment_status}).`);
    return;
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

  const name = link.signupName;
  const email = link.signupEmail;
  const emailSlug = await generateUniqueEmailSlug(name);
  // The email may have been taken since they filled in the page; the
  // client and site are still made, and Craig is told to give them a login.
  const emailFree = !(await db.user.findUnique({ where: { email }, select: { id: true } }));

  const made = await db.$transaction(async (tx) => {
    const { count } = await tx.signupLink.updateMany({
      where: { id: link.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (count === 0) return null;
    const artist = await tx.artist.create({
      data: { name, kind: "ARTIST", email, phone: link.signupPhone, emailSlug },
      select: { id: true },
    });
    if (link.siteTheme && cleanThemeEntries(link.siteTheme.entries).some((e) => e.kind === "CURATIONS")) {
      await tx.curation.create({ data: { artistId: artist.id, name: FIRST_CURATION_NAME } });
    }
    const site = await tx.site.create({
      data: {
        name,
        artistId: artist.id,
        // The sign-up's currency: what it pays in, and its works' to start
        // (changed in its settings — kept apart, 2026-11-13).
        defaultCurrency: link.currency,
        planId: link.planId,
        planPrice: link.planPrice,
        planCurrency: link.currency,
        siteThemeId: link.siteThemeId,
        billingStripeMode: mode,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeSubscriptionStatus: "active",
        addOns: {
          create: link.addOns.map((a) => ({ addOn: a.addOn, quantity: a.quantity, monthlyPrice: a.monthlyPrice })),
        },
      },
      select: { id: true },
    });
    if (emailFree && link.passwordHash) {
      await tx.user.create({
        data: { name, email, role: "ARTIST", artistId: artist.id, passwordHash: link.passwordHash },
      });
    }
    await tx.signupLink.update({ where: { id: link.id }, data: { siteId: site.id, passwordHash: null } });
    return { artistId: artist.id, siteId: site.id };
  });
  if (!made) return;

  // The site's pages from its theme. Done after the records are safe, so a
  // problem here doesn't lose the sign-up; Craig is told instead. Art
  // Manager only (2026-11-13): no theme — the site stays hidden, with no
  // pages, until Web Manager is added.
  let themeProblem: string | null = null;
  if (link.siteThemeId) {
    try {
      const applied = await applyThemeToSite(made.siteId, link.siteThemeId);
      if ("error" in applied) themeProblem = applied.error;
    } catch (err) {
      console.error("Sign-up: applying the theme failed", err);
      themeProblem = "it failed";
    }
  }

  const addOns = link.addOns.map((a) => ({
    addOn: a.addOn,
    quantity: a.quantity,
    monthlyPrice: a.monthlyPrice.toFixed(2),
  }));
  const total = formatMoney(monthlyTotalPence(link.planPrice.toFixed(2), addOns) / 100, link.currency);
  const testNote = mode === "TEST" ? " (Stripe Test)" : "";

  const problems = [
    emailFree ? null : `No login was made: ${email} already has one. Give them a login on their Client page.`,
    themeProblem ? `The theme's pages weren't made (${themeProblem}) — apply the theme from the site's Pages page.` : null,
  ].filter((p): p is string => !!p);

  await db.alertEvent.create({
    data: {
      artistId: made.artistId,
      type: SIGNUP_ALERT_TYPE,
      severity: problems.length ? "CRITICAL" : "WARNING",
      message: `${name} signed up — ${link.plan.name}, ${total} a month${testNote}.${problems.length ? ` ${problems.join(" ")}` : ""}`,
    },
  });

  await sendSignupEmails({
    artistId: made.artistId,
    siteId: made.siteId,
    name,
    email,
    phone: link.signupPhone,
    planName: link.plan.name,
    addOnLines: addOns.map((a) => {
      const label = ADD_ONS.find((o) => o.key === a.addOn)?.label ?? a.addOn;
      return a.quantity > 1 ? `${label} × ${a.quantity}` : label;
    }),
    total,
    testNote,
    website: !!link.siteThemeId,
    hasLogin: emailFree,
    problems,
  });
}

// The welcome email to the client and the note to Craig, both from the
// Business mailbox's address. The sign-up is already made, so a failure
// here is only logged.
async function sendSignupEmails(input: {
  artistId: string;
  siteId: string;
  name: string;
  email: string;
  phone: string | null;
  planName: string;
  addOnLines: string[];
  total: string;
  testNote: string;
  // With the website (a theme) — otherwise Art Manager only.
  website: boolean;
  hasLogin: boolean;
  problems: string[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Sign-up emails not sent — RESEND_API_KEY is missing.");
    return;
  }
  const { businessEmailAddress: business } = await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { businessEmailAddress: true },
  });
  const resend = new Resend(apiKey);
  const from = `Craig, Jetenvoieca <${business}>`;
  const plan = [input.planName, ...input.addOnLines].join(" + ");

  // Art Manager only (2026-11-13): no site to speak of.
  const ready = input.website ? "your site" : "your Art Manager";
  const welcomeSubject = `Welcome — ${ready} is ready`;
  const welcomeBody = [
    `Hello ${input.name},`,
    "",
    `Thank you for signing up. ${ready.charAt(0).toUpperCase()}${ready.slice(1)} is ready for you to start on.`,
    "",
    input.hasLogin
      ? `Log in at ${APP_URL}/login with this email (${input.email}) and the password you chose.`
      : "We'll be in touch shortly with your login.",
    "",
    `Your plan: ${plan} — ${input.total} a month, paid by card each month.`,
    "",
    "If you have any questions, just reply to this email.",
    "",
    "Craig",
    "Je t'envoie ça",
  ].join("\n");
  const welcome = await resend.emails.send({ from, to: input.email, subject: welcomeSubject, text: welcomeBody });
  if (welcome.error) {
    console.warn(`Sign-up welcome email to ${input.email} failed: ${welcome.error.message}`);
  } else {
    await db.outboundEmail.create({
      data: {
        resendEmailId: welcome.data?.id ?? null,
        fromAddress: business,
        toAddress: input.email,
        subject: welcomeSubject,
        body: welcomeBody,
        kind: "WELCOME",
        mailbox: "BUSINESS",
        artistId: input.artistId,
      },
    });
  }

  const note = await resend.emails.send({
    from,
    to: business,
    subject: `New sign-up: ${input.name} — ${input.planName}${input.testNote}`,
    text: [
      `${input.name} has signed up${input.testNote}.`,
      "",
      `Email: ${input.email}`,
      `Phone: ${input.phone ?? "—"}`,
      `Plan: ${plan}`,
      `A month: ${input.total}`,
      "",
      `Their site: ${APP_URL}/sites/${input.siteId}`,
      ...(input.problems.length ? ["", "To do:", ...input.problems.map((p) => `- ${p}`)] : []),
    ].join("\n"),
  });
  if (note.error) console.warn(`Sign-up note to ${business} failed: ${note.error.message}`);
}
