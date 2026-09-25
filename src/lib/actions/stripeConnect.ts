"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { getConnectClientId } from "@/lib/stripeConnect";

// "Disconnect" (Settings → Financial, 2026-09-25) — unlinks the artist's
// own Stripe account for their current mode, so NEW sales go back to
// Jetenvoieca's account. Refused while any unpaid sale is still being
// paid into that account (its payment links, card payments or
// instalments would stop being recorded) — those must be finished or
// deleted first. Paid sales are unaffected. Also revokes Jetenvoieca's
// access in Stripe itself; if Stripe says it's already revoked, the link
// is still removed here.
export async function disconnectStripeAccount(
  artistId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const artist = await db.artist.findUnique({ where: { id: artistId }, select: { stripeMode: true } });
  if (!artist) return { ok: false, error: "Artist not found." };

  const connection = await db.stripeConnection.findUnique({
    where: { artistId_mode: { artistId, mode: artist.stripeMode } },
  });
  if (!connection) return { ok: true };

  const unpaid = await db.purchase.count({
    where: {
      status: "ACTIVE",
      stripeMode: connection.mode,
      stripeAccountId: connection.accountId,
      artwork: { artistId },
    },
  });
  if (unpaid > 0) {
    const name = connection.accountName || connection.accountId;
    return {
      ok: false,
      error: `${unpaid} unpaid sale${unpaid === 1 ? " is" : "s are"} being paid into ${name}. Finish or delete ${unpaid === 1 ? "it" : "them"} before disconnecting.`,
    };
  }

  try {
    await getStripeClient({ mode: connection.mode, accountId: null }).oauth.deauthorize({
      client_id: getConnectClientId(connection.mode),
      stripe_user_id: connection.accountId,
    });
  } catch {
    // Already revoked on Stripe's side — nothing more to undo there.
  }

  await db.stripeConnection.delete({ where: { id: connection.id } });
  revalidatePath("/");
  return { ok: true };
}
