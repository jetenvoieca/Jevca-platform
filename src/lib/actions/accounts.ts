"use server";

import { revalidatePath } from "next/cache";
import { backfillMissingSubscriptionPayments } from "@/lib/platformSubscriptionSync";

// Thin Server Action wrapper — the actual logic lives in
// platformSubscriptionSync.ts, next to the webhook handler it mirrors
// (same idempotent recordPlatformInvoicePaid path, different source: this
// asks Stripe directly instead of waiting on a webhook delivery). See the
// note on backfillMissingSubscriptionPayments itself for why this exists.
//
// Catches its own errors and logs them server-side (2026-08-18, added
// after the first real run showed only a generic "Couldn't reach Stripe"
// with no way to see what actually went wrong) — same reason documented
// elsewhere in this codebase: an error thrown inside a Server Action gets
// silently redacted to an opaque "digest" message by Next.js in
// production, so without this the real cause is invisible even in the
// browser's own network tab, not just to the person using the button.
export async function runSubscriptionPaymentsBackfill(): Promise<
  { ok: true; checked: number; created: number } | { ok: false; error: string }
> {
  try {
    const result = await backfillMissingSubscriptionPayments();
    if (result.created > 0) {
      revalidatePath("/accounts");
    }
    return { ok: true, ...result };
  } catch (err) {
    console.error("Accounts backfill failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
