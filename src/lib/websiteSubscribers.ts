import { db } from "@/lib/db";

// A website visitor joining an artist's mailing list (2026-10-10; shared
// with the Presentation window's enquiry form 2026-10-19) — Craig's
// choices: subscribed straight away (no confirmation mail), and someone
// who unsubscribed earlier is subscribed again. A bounced or spam-marked
// address keeps that status (set back by hand on the Subscribers page).
// Saved with no language, so the artist's default applies. A name, if
// given, is only used for a new subscriber. Server-only. Returns the
// subscriber's id.
export async function subscribeFromWebsite(
  artistId: string,
  email: string,
  name?: { firstName: string | null; lastName: string | null },
): Promise<string> {
  const now = new Date();
  const subscriber = await db.subscriber.upsert({
    where: { artistId_email: { artistId, email } },
    create: { artistId, email, source: "WEBSITE", consentAt: now, ...name },
    update: {},
    select: { id: true },
  });
  await db.subscriber.updateMany({
    where: { id: subscriber.id, status: "UNSUBSCRIBED" },
    data: { status: "SUBSCRIBED", unsubscribedAt: null, consentAt: now },
  });
  return subscriber.id;
}
