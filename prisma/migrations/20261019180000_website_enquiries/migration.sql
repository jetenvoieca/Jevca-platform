-- The artist's Instagram username, for the enquiry form's "Or DM on Instagram".
ALTER TABLE "Artist" ADD COLUMN "instagramHandle" TEXT;

-- Website enquiries go into the Inbox without passing through Resend.
ALTER TABLE "InboundEmail" ALTER COLUMN "resendEmailId" DROP NOT NULL;
