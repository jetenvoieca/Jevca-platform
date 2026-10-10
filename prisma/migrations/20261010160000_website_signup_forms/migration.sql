-- Website sign-up forms (2026-10-10): each form's list and wording, per page.
CREATE TABLE "PageSignupForm" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "listId" TEXT,
    "placeholder" TEXT NOT NULL,
    "buttonLabel" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "thanksText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSignupForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageSignupForm_pageId_blockId_key" ON "PageSignupForm"("pageId", "blockId");
CREATE INDEX "PageSignupForm_listId_idx" ON "PageSignupForm"("listId");

ALTER TABLE "PageSignupForm" ADD CONSTRAINT "PageSignupForm_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageSignupForm" ADD CONSTRAINT "PageSignupForm_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MailList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cloudflare Turnstile widgets the app manages (2026-10-10).
CREATE TABLE "TurnstileWidget" (
    "sitekey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "domains" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnstileWidget_pkey" PRIMARY KEY ("sitekey")
);
