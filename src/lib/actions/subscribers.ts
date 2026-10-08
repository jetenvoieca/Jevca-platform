"use server";

import Papa from "papaparse";
import { db } from "@/lib/db";

// Marketing → Subscribers (2026-10-08) — each artist's mailing list and
// its named mail lists. See Subscriber and MailList in schema.prisma.
//
// Every action takes the artistId and only ever touches subscribers and
// lists belonging to that artist. No revalidatePath: the Subscribers
// page keeps its own state up to date from what these return, same as
// actions/curations.ts.

export type SubscriberLanguage = "EN" | "FR";
// Same values as the SubscriberStatus / SubscriberSource enums in
// schema.prisma.
export type SubscriberStatus = "SUBSCRIBED" | "UNSUBSCRIBED";
export type SubscriberSource = "MANUAL" | "IMPORT" | "CUSTOMER" | "WEBSITE";

// How many subscribers each list holds is counted on the page from the
// subscribers themselves, so it's always in step with them.
export type MailListSummary = {
  id: string;
  name: string;
};

export type SubscriberRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  language: SubscriberLanguage | null;
  status: SubscriberStatus;
  source: SubscriberSource;
  consentAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  listIds: string[];
};

type Result<T> = T | { error: string };

// What a subscriber holds as typed in (Add subscriber, an import row, a
// customer). Email is required; everything else optional.
export type SubscriberInput = {
  email: string;
  firstName: string;
  lastName: string;
  language: SubscriberLanguage | null;
};

// Rows are sent to the server in chunks of this size during an import,
// so a large file never makes one oversized request.
// (The import panel sends 250 at a time.)
const IMPORT_CHUNK_LIMIT = 500;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

function cleanLanguage(raw: unknown): SubscriberLanguage | null {
  return raw === "EN" || raw === "FR" ? raw : null;
}

function cleanText(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  return v ? v : null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

const SUBSCRIBER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  language: true,
  status: true,
  source: true,
  consentAt: true,
  unsubscribedAt: true,
  createdAt: true,
  lists: { select: { listId: true } },
} as const;

type SubscriberRecord = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  language: string | null;
  status: SubscriberStatus;
  source: SubscriberSource;
  consentAt: Date | null;
  unsubscribedAt: Date | null;
  createdAt: Date;
  lists: { listId: string }[];
};

function toRow(s: SubscriberRecord): SubscriberRow {
  return {
    id: s.id,
    email: s.email,
    firstName: s.firstName,
    lastName: s.lastName,
    language: cleanLanguage(s.language),
    status: s.status,
    source: s.source,
    consentAt: s.consentAt ? s.consentAt.toISOString() : null,
    unsubscribedAt: s.unsubscribedAt ? s.unsubscribedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    listIds: s.lists.map((l) => l.listId),
  };
}

async function getRow(subscriberId: string, artistId: string): Promise<SubscriberRow | null> {
  const s = await db.subscriber.findFirst({
    where: { id: subscriberId, artistId },
    select: SUBSCRIBER_SELECT,
  });
  return s ? toRow(s) : null;
}

// Only the ids that really are this artist's lists.
async function ownedListIds(artistId: string, listIds: string[]): Promise<string[]> {
  if (listIds.length === 0) return [];
  const rows = await db.mailList.findMany({
    where: { artistId, id: { in: [...new Set(listIds)] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------
// Mail lists
// ---------------------------------------------------------------------

// Oldest first, so a new list is added to the bottom.
export async function listMailLists(artistId: string): Promise<MailListSummary[]> {
  return db.mailList.findMany({
    where: { artistId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

export async function createMailList(
  artistId: string,
  nameRaw: string
): Promise<Result<MailListSummary>> {
  const name = nameRaw.trim();
  if (!name) return { error: "A name is required." };
  try {
    return await db.mailList.create({
      data: { artistId, name },
      select: { id: true, name: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A mail list with this name already exists." };
    throw err;
  }
}

export async function renameMailList(
  listId: string,
  artistId: string,
  nameRaw: string
): Promise<Result<{ ok: true }>> {
  const name = nameRaw.trim();
  if (!name) return { error: "A name is required." };
  try {
    const { count } = await db.mailList.updateMany({ where: { id: listId, artistId }, data: { name } });
    if (count === 0) return { error: "Mail list not found." };
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "A mail list with this name already exists." };
    throw err;
  }
}

// A new list with the same subscribers, named "<name> (copy)" — or
// "(copy 2)" and so on if that name is taken.
export async function duplicateMailList(
  listId: string,
  artistId: string
): Promise<Result<MailListSummary>> {
  const source = await db.mailList.findFirst({
    where: { id: listId, artistId },
    select: { name: true },
  });
  if (!source) return { error: "Mail list not found." };

  const taken = new Set(
    (await db.mailList.findMany({ where: { artistId }, select: { name: true } })).map((l) => l.name)
  );
  let name = `${source.name} (copy)`;
  for (let n = 2; taken.has(name); n++) name = `${source.name} (copy ${n})`;

  return db.$transaction(async (tx) => {
    const list = await tx.mailList.create({
      data: { artistId, name },
      select: { id: true, name: true },
    });
    await tx.$executeRaw`
      INSERT INTO "MailListMember" ("listId", "subscriberId", "addedAt")
      SELECT ${list.id}, "subscriberId", CURRENT_TIMESTAMP
      FROM "MailListMember" WHERE "listId" = ${listId}
    `;
    return list;
  });
}

// Removes the list only — its subscribers stay on file.
export async function deleteMailList(listId: string, artistId: string): Promise<void> {
  await db.mailList.deleteMany({ where: { id: listId, artistId } });
}

// ---------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------

// Every subscriber of the artist, newest first, with the lists each is in.
export async function listSubscribers(artistId: string): Promise<SubscriberRow[]> {
  const rows = await db.subscriber.findMany({
    where: { artistId },
    orderBy: { createdAt: "desc" },
    select: SUBSCRIBER_SELECT,
  });
  return rows.map(toRow);
}

// Add subscriber, by hand. Consent must be confirmed by whoever adds them.
export async function addSubscriber(
  artistId: string,
  input: SubscriberInput & { listIds: string[]; consent: boolean }
): Promise<Result<SubscriberRow>> {
  if (!input.consent) return { error: "Please confirm they agreed to receive emails." };
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };

  const listIds = await ownedListIds(artistId, input.listIds);
  try {
    const created = await db.subscriber.create({
      data: {
        artistId,
        email,
        firstName: cleanText(input.firstName),
        lastName: cleanText(input.lastName),
        language: cleanLanguage(input.language),
        source: "MANUAL",
        consentAt: new Date(),
        lists: { create: listIds.map((listId) => ({ listId })) },
      },
      select: SUBSCRIBER_SELECT,
    });
    return toRow(created);
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "This email address is already on file." };
    throw err;
  }
}

// Saves a subscriber's details — whichever fields are given.
export async function updateSubscriber(
  subscriberId: string,
  artistId: string,
  patch: Partial<SubscriberInput>
): Promise<Result<SubscriberRow>> {
  const data: { email?: string; firstName?: string | null; lastName?: string | null; language?: string | null } = {};
  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
    data.email = email;
  }
  if (patch.firstName !== undefined) data.firstName = cleanText(patch.firstName);
  if (patch.lastName !== undefined) data.lastName = cleanText(patch.lastName);
  if (patch.language !== undefined) data.language = cleanLanguage(patch.language);

  try {
    const { count } = await db.subscriber.updateMany({ where: { id: subscriberId, artistId }, data });
    if (count === 0) return { error: "Subscriber not found." };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "This email address is already on file." };
    throw err;
  }
  return (await getRow(subscriberId, artistId)) ?? { error: "Subscriber not found." };
}

// Subscribed ⇄ Unsubscribed, set by hand (e.g. someone asks by email).
export async function setSubscriberStatus(
  subscriberId: string,
  artistId: string,
  status: SubscriberStatus
): Promise<Result<SubscriberRow>> {
  const { count } = await db.subscriber.updateMany({
    where: { id: subscriberId, artistId },
    data: {
      status,
      unsubscribedAt: status === "UNSUBSCRIBED" ? new Date() : null,
    },
  });
  if (count === 0) return { error: "Subscriber not found." };
  return (await getRow(subscriberId, artistId)) ?? { error: "Subscriber not found." };
}

// Sets exactly which of the artist's lists this subscriber is in.
export async function setSubscriberLists(
  subscriberId: string,
  artistId: string,
  listIdsRaw: string[]
): Promise<Result<SubscriberRow>> {
  const exists = await db.subscriber.findFirst({
    where: { id: subscriberId, artistId },
    select: { id: true },
  });
  if (!exists) return { error: "Subscriber not found." };

  const listIds = await ownedListIds(artistId, listIdsRaw);
  await db.$transaction([
    db.mailListMember.deleteMany({ where: { subscriberId, listId: { notIn: listIds } } }),
    db.mailListMember.createMany({
      data: listIds.map((listId) => ({ listId, subscriberId })),
      skipDuplicates: true,
    }),
  ]);
  return (await getRow(subscriberId, artistId)) ?? { error: "Subscriber not found." };
}

// Removes the subscriber completely (e.g. a request to erase their
// details). Unlike Unsubscribe, nothing is kept, so a later import could
// add them again.
export async function deleteSubscriber(subscriberId: string, artistId: string): Promise<void> {
  await db.subscriber.deleteMany({ where: { id: subscriberId, artistId } });
}

// ---------------------------------------------------------------------
// Adding many at once (CSV import, from Customers)
// ---------------------------------------------------------------------

export type BulkAddResult = { added: number; alreadyOnFile: number };

// Adds everyone not already on file (matched by email, Subscribed or
// Unsubscribed) and puts everyone given — new or already on file — into
// the chosen list. Anyone already on file keeps their details and status
// untouched, so an Unsubscribed person is never subscribed again.
async function bulkAdd(
  artistId: string,
  people: (SubscriberInput & { customerId?: string | null })[],
  source: SubscriberSource,
  listId: string | null
): Promise<BulkAddResult> {
  const byEmail = new Map<string, (typeof people)[number]>();
  for (const p of people) {
    const email = normalizeEmail(p.email);
    if (isValidEmail(email) && !byEmail.has(email)) byEmail.set(email, { ...p, email });
  }
  const emails = [...byEmail.keys()];
  if (emails.length === 0) return { added: 0, alreadyOnFile: 0 };

  const consentAt = new Date();
  const { count: added } = await db.subscriber.createMany({
    data: [...byEmail.values()].map((p) => ({
      artistId,
      email: p.email,
      firstName: cleanText(p.firstName),
      lastName: cleanText(p.lastName),
      language: cleanLanguage(p.language),
      source,
      consentAt,
      customerId: p.customerId ?? null,
    })),
    skipDuplicates: true,
  });

  const [ownedList] = listId ? await ownedListIds(artistId, [listId]) : [];
  if (ownedList) {
    const ids = await db.subscriber.findMany({
      where: { artistId, email: { in: emails } },
      select: { id: true },
    });
    await db.mailListMember.createMany({
      data: ids.map((s) => ({ listId: ownedList, subscriberId: s.id })),
      skipDuplicates: true,
    });
  }

  return { added, alreadyOnFile: emails.length - added };
}

export type ParsedSubscriberCsv = {
  rows: SubscriberInput[];
  // Rows with no usable email address, or repeating one earlier in the file.
  skipped: number;
  parseErrors: string[];
};

// Column names are matched loosely — case, spaces, "-" and "_" ignored —
// so most mailing-list exports work as they are: an Email column is
// required; First name / Surname (or Last name), or a single Name, and a
// Language column (EN/FR, English/French) are optional.
const COLUMN_ALIASES: Record<keyof SubscriberInput | "name", string[]> = {
  email: ["email", "emailaddress", "mail"],
  firstName: ["firstname", "forename", "prenom", "givenname"],
  lastName: ["lastname", "surname", "nom", "familyname"],
  name: ["name", "fullname"],
  language: ["language", "lang", "langue"],
};

function headerKey(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function csvLanguage(raw: string | undefined): SubscriberLanguage | null {
  const v = raw?.trim().toLowerCase();
  if (v === "en" || v === "english" || v === "anglais") return "EN";
  if (v === "fr" || v === "french" || v === "francais" || v === "français") return "FR";
  return null;
}

export async function parseSubscriberCsv(csvText: string): Promise<Result<ParsedSubscriberCsv>> {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const columns = new Map<string, string>();
  for (const field of result.meta.fields ?? []) {
    const key = headerKey(field);
    for (const [target, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(key) && !columns.has(target)) columns.set(target, field);
    }
  }
  const emailCol = columns.get("email");
  if (!emailCol) return { error: "No Email column found in this file." };

  const cell = (r: Record<string, string>, target: string) => {
    const col = columns.get(target);
    return col ? (r[col] ?? "").trim() : "";
  };

  const seen = new Set<string>();
  const rows: SubscriberInput[] = [];
  let skipped = 0;
  for (const r of result.data) {
    const email = normalizeEmail(r[emailCol] ?? "");
    if (!isValidEmail(email) || seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    let firstName = cell(r, "firstName");
    let lastName = cell(r, "lastName");
    if (!firstName && !lastName) {
      const [first, ...rest] = cell(r, "name").split(/\s+/);
      firstName = first ?? "";
      lastName = rest.join(" ");
    }
    rows.push({ email, firstName, lastName, language: csvLanguage(cell(r, "language")) });
  }

  return {
    rows,
    skipped,
    parseErrors: result.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`),
  };
}

// One chunk of an import, called in turn by the import panel so it can
// show progress. Consent must be confirmed for the whole file.
export async function importSubscribers(
  artistId: string,
  rows: SubscriberInput[],
  listId: string | null,
  consent: boolean
): Promise<Result<BulkAddResult>> {
  if (!consent) return { error: "Please confirm these people agreed to receive emails." };
  if (rows.length > IMPORT_CHUNK_LIMIT) return { error: "Too many rows in one go." };
  return bulkAdd(artistId, rows, "IMPORT", listId);
}

export type SubscribableCustomer = {
  id: string;
  name: string;
  email: string;
  alreadySubscriber: boolean;
};

// The artist's individual customers who have an email address, for
// "Add from Customers" — each marked if already on file as a subscriber.
export async function listSubscribableCustomers(artistId: string): Promise<SubscribableCustomer[]> {
  const [customers, subscribers] = await Promise.all([
    db.customer.findMany({
      where: { artistId, kind: "INDIVIDUAL", email: { not: null } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.subscriber.findMany({ where: { artistId }, select: { email: true } }),
  ]);
  const onFile = new Set(subscribers.map((s) => s.email));
  return customers
    .map((c) => ({ id: c.id, name: c.name, email: normalizeEmail(c.email ?? "") }))
    .filter((c) => isValidEmail(c.email))
    .map((c) => ({ ...c, alreadySubscriber: onFile.has(c.email) }));
}

export async function subscribeCustomers(
  artistId: string,
  customerIds: string[],
  listId: string | null,
  consent: boolean
): Promise<Result<BulkAddResult>> {
  if (!consent) return { error: "Please confirm these people agreed to receive emails." };
  const customers = await db.customer.findMany({
    where: { artistId, kind: "INDIVIDUAL", id: { in: customerIds }, email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, name: true, language: true },
  });
  return bulkAdd(
    artistId,
    customers.map((c) => ({
      email: c.email ?? "",
      firstName: c.firstName ?? (c.lastName ? "" : c.name),
      lastName: c.lastName ?? "",
      language: cleanLanguage(c.language),
      customerId: c.id,
    })),
    "CUSTOMER",
    listId
  );
}
