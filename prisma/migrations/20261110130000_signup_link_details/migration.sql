-- What a person gives on the sign-up page, kept on their link while they
-- pay (2026-11-10) — see SignupLink in schema.prisma.
ALTER TABLE "SignupLink" ADD COLUMN "signupName" TEXT;
ALTER TABLE "SignupLink" ADD COLUMN "signupEmail" TEXT;
ALTER TABLE "SignupLink" ADD COLUMN "signupPhone" TEXT;
ALTER TABLE "SignupLink" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "SignupLink" ADD COLUMN "stripeMode" "StripeMode";
ALTER TABLE "SignupLink" ADD COLUMN "stripeCheckoutSessionId" TEXT;
CREATE UNIQUE INDEX "SignupLink_stripeCheckoutSessionId_key" ON "SignupLink"("stripeCheckoutSessionId");
