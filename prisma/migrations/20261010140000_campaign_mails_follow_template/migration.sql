-- Unsent campaign mails follow their template's look (2026-10-10): from
-- now on the app copies a template's colours, spacing, margins and text
-- styles into its unsent mails whenever the template is saved. This
-- brings the mails made before that up to date once.
UPDATE "CampaignMail" AS m
SET "layout" = m."layout" || jsonb_build_object(
  'surroundColor', t."layout"->'surroundColor',
  'backgroundColor', t."layout"->'backgroundColor',
  'gridSpacing', t."layout"->'gridSpacing',
  'margins', t."layout"->'margins',
  'textStyles', t."layout"->'textStyles'
)
FROM "MailTemplate" AS t, "Campaign" AS c
WHERE m."templateId" = t."id"
  AND m."campaignId" = c."id"
  AND (
    (m."kind" IN ('PRINCIPAL', 'ALTERNATIVE') AND c."status" IN ('DRAFT', 'SCHEDULED'))
    OR (m."kind" = 'FOLLOW_UP' AND m."followUpStartedAt" IS NULL)
  );
