import { normalizeMailTemplate } from "@/lib/mailTemplateLayout";
import { cleanMailContent, type Localized, type MailLanguage } from "@/lib/mailContent";
import { loadMailAssets } from "@/lib/mailAssets";
import { renderMailHtml } from "@/lib/mailHtml";
import { CAMPAIGN_PUBLIC_URL } from "@/lib/email";

// A campaign mail drawn as email HTML in one language (2026-10-08) —
// shared by the Preview, the Test message and real sending, so all three
// show exactly the same mail. Server-only plain module.

const MAX_SUBJECT = 200;

// A subject or preview line: one line, trimmed, at most 200 characters;
// null when empty.
export function cleanSubjectLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/g, " ").trim().slice(0, MAX_SUBJECT);
  return line || null;
}

// What a mail is drawn from — what the editor holds, or what's saved.
export type CampaignMailSource = {
  layout: unknown;
  content: unknown;
  subject: Localized<string>;
  preview: Localized<string>;
};

// Cleaned with the same rules the editor uses. The Preview (`sending`
// null) uses the app's own image addresses; a mail sent out needs full
// ones on the campaign mails' address, and its unsubscribe link.
export async function renderCampaignMail(
  siteId: string,
  mail: CampaignMailSource,
  language: MailLanguage,
  sending: { unsubscribeUrl: string } | null
): Promise<{ html: string; subject: string } | { error: string }> {
  const layout = normalizeMailTemplate(mail.layout);
  const content = cleanMailContent(mail.content, layout);
  const assets = await loadMailAssets(siteId, content, sending ? CAMPAIGN_PUBLIC_URL : "");
  if (!assets) return { error: "Site not found." };
  const subject = cleanSubjectLine(mail.subject?.[language]) ?? "";
  return {
    subject,
    html: renderMailHtml({
      layout,
      content,
      language,
      subject,
      preview: cleanSubjectLine(mail.preview?.[language]) ?? "",
      assets,
      unsubscribeUrl: sending?.unsubscribeUrl ?? "#",
    }),
  };
}
