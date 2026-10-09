import { db } from "@/lib/db";

// Campaign tracking (2026-10-09, Marketing step 4a). Resend reports what
// happens to every mail it sends (see app/api/webhooks/resend-campaigns);
// this records it on the campaign recipient it belongs to:
// - delivered / opened / clicked: the first time each happened. A click
//   counts as an open too (the open is only seen when images load).
// - bounced: the date, Resend's bounce type and its reason. A hard
//   (Permanent) bounce marks the subscriber BOUNCED.
// - suppressed: Resend refused to send because the address bounced or
//   complained before. Recorded as a bounce; the subscriber is BOUNCED.
// - complained (marked as spam): the subscriber is COMPLAINED.
// - failed: the recipient is FAILED, with Resend's reason.
// BOUNCED and COMPLAINED subscribers are never sent campaigns again,
// which keeps news.jevca.art's sending reputation good for every artist.
// Resend may send an event more than once or out of order; every update
// keeps the earliest time, so that changes nothing.
// Server-only plain module.

export type CampaignEvent = {
  type: string;
  createdAt: string;
  emailId: string;
  to: string[];
  tags: Record<string, string>;
  clickedAt?: string;
  bounce?: { type: string; message: string };
  reason?: string;
};

// Events for mails that aren't campaign mails (invoices, receipts…) carry
// no campaign tag and are ignored.
export async function recordCampaignEvent(event: CampaignEvent): Promise<void> {
  const campaignId = event.tags.campaign;
  if (!campaignId) return;

  const recipient = await findRecipient(event.emailId, campaignId, event.tags.mail, event.to[0]);
  if (!recipient) return;

  const at = parseDate(event.type === "email.clicked" ? event.clickedAt : undefined) ?? parseDate(event.createdAt) ?? new Date();

  switch (event.type) {
    case "email.delivered":
      await db.$executeRaw`
        UPDATE "CampaignRecipient" SET "deliveredAt" = LEAST("deliveredAt", ${at})
        WHERE "id" = ${recipient.id}`;
      return;

    case "email.opened":
      await db.$executeRaw`
        UPDATE "CampaignRecipient" SET
          "deliveredAt" = LEAST("deliveredAt", ${at}),
          "openedAt" = LEAST("openedAt", ${at})
        WHERE "id" = ${recipient.id}`;
      return;

    case "email.clicked":
      await db.$executeRaw`
        UPDATE "CampaignRecipient" SET
          "deliveredAt" = LEAST("deliveredAt", ${at}),
          "openedAt" = LEAST("openedAt", ${at}),
          "clickedAt" = LEAST("clickedAt", ${at})
        WHERE "id" = ${recipient.id}`;
      return;

    case "email.bounced": {
      const type = event.bounce?.type ?? "Undetermined";
      await recordBounce(recipient.id, at, type, event.bounce?.message ?? "Bounced");
      if (type === "Permanent") await stopSubscriber(recipient.subscriberId, "BOUNCED");
      return;
    }

    case "email.suppressed":
      await recordBounce(recipient.id, at, "Suppressed", event.reason ?? "On Resend's suppression list");
      await stopSubscriber(recipient.subscriberId, "BOUNCED");
      return;

    case "email.complained":
      await db.$executeRaw`
        UPDATE "CampaignRecipient" SET "complainedAt" = LEAST("complainedAt", ${at})
        WHERE "id" = ${recipient.id}`;
      await stopSubscriber(recipient.subscriberId, "COMPLAINED");
      return;

    case "email.failed":
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "FAILED", error: (event.reason ?? "Failed").slice(0, 500) },
      });
      return;
  }
}

// By Resend's id for the mail. Should Resend's event arrive before that
// id is saved (it's saved just after the batch is accepted), by the
// mail and address instead — each mail goes to an address once (the
// campaign's mail and its follow-up are two mails).
async function findRecipient(emailId: string, campaignId: string, mailId: string | undefined, to: string | undefined) {
  const select = { id: true, subscriberId: true, resendEmailId: true } as const;
  const byId = emailId
    ? await db.campaignRecipient.findFirst({ where: { resendEmailId: emailId, campaignId }, select })
    : null;
  if (byId) return byId;
  const email = to?.trim().toLowerCase();
  if (!email || !mailId) return null;
  const byAddress = await db.campaignRecipient.findFirst({ where: { campaignId, mailId, email }, select });
  if (byAddress && !byAddress.resendEmailId && emailId) {
    await db.campaignRecipient.update({ where: { id: byAddress.id }, data: { resendEmailId: emailId } });
  }
  return byAddress;
}

async function recordBounce(recipientId: string, at: Date, type: string, message: string): Promise<void> {
  await db.campaignRecipient.update({
    where: { id: recipientId },
    data: { bouncedAt: at, bounceType: type.slice(0, 50), error: message.slice(0, 500) },
  });
}

// A bounce only stops someone still subscribed; a spam complaint is
// recorded whatever their status was (it's the stronger reason).
async function stopSubscriber(subscriberId: string | null, status: "BOUNCED" | "COMPLAINED"): Promise<void> {
  if (!subscriberId) return;
  await db.subscriber.updateMany({
    where:
      status === "BOUNCED"
        ? { id: subscriberId, status: "SUBSCRIBED" }
        : { id: subscriberId, status: { not: "COMPLAINED" } },
    data: { status },
  });
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
