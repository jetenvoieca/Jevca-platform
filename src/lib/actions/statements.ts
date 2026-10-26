"use server";

import * as statements from "@/lib/statementRecords";
import { requireCustomerAccess, requireStatementAccess } from "@/lib/recordOwners";

// Gallery statements, from the browser (2026-10-26): each checks the
// person logged in has access to the gallery or statement, then does the
// work in lib/statementRecords.ts (the Stripe webhook calls that directly).

export type { StatementChoice, StatementWindowData, StatementEmailDraft } from "@/lib/statementRecords";

export async function getStatementChoices(...args: Parameters<typeof statements.getStatementChoices>) {
  await requireCustomerAccess(args[0]);
  return statements.getStatementChoices(...args);
}

export async function makeStatement(...args: Parameters<typeof statements.makeStatement>) {
  await requireCustomerAccess(args[0]);
  return statements.makeStatement(...args);
}

export async function recordStatementPaymentIntent(...args: Parameters<typeof statements.recordStatementPaymentIntent>) {
  await requireStatementAccess(args[0]);
  return statements.recordStatementPaymentIntent(...args);
}

export async function getStatementWindow(...args: Parameters<typeof statements.getStatementWindow>) {
  await requireStatementAccess(args[0]);
  return statements.getStatementWindow(...args);
}

export async function getStatementEmailDraft(...args: Parameters<typeof statements.getStatementEmailDraft>) {
  await requireStatementAccess(args[0]);
  return statements.getStatementEmailDraft(...args);
}

export async function sendStatementEmail(...args: Parameters<typeof statements.sendStatementEmail>) {
  await requireStatementAccess(args[0]);
  return statements.sendStatementEmail(...args);
}
