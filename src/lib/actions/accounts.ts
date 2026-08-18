"use server";

import { revalidatePath } from "next/cache";
import { backfillMissingSubscriptionPayments } from "@/lib/platformSubscriptionSync";

// Thin Server Action wrapper — the actual logic lives in
// platformSubscriptionSync.ts, next to the webhook handler it mirrors
// (same idempotent recordPlatformInvoicePaid path, different source: this
// asks Stripe directly instead of waiting on a webhook delivery). See the
// note on backfillMissingSubscriptionPayments itself for why this exists.
export async function runSubscriptionPaymentsBackfill(): Promise<{
  checked: number;
  created: number;
}> {
  const result = await backfillMissingSubscriptionPayments();
  if (result.created > 0) {
    revalidatePath("/accounts");
  }
  return result;
}
