"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { readableEmailText } from "@/lib/emailText";

// Tasks on the admin Inbox's Task view (2026-09-19, CRM Phase 2). An
// open task has completedAt null; completing it sets completedAt, which
// is what the Done list reads. See the Task model in schema.prisma.
//
// A task can also hold an email address and send email from itself
// (2026-09-27) — sending goes through sendAdminEmail (actions/
// adminEmail.ts) with the task's id; getTaskActivity below lists what was
// sent and the replies that came back (see lib/emailThreading.ts).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TaskItem = {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  targetDate: string | null; // "YYYY-MM-DD"
  category: string | null;
  artistId: string | null;
  artistName: string | null;
  completedAt: string | null; // ISO
};

// What the task form submits — every field a plain string (empty string
// = not set), so the form's own state can be passed straight through.
export type TaskInput = {
  id: string | null; // null = a new task
  name: string;
  description: string;
  email: string;
  targetDate: string; // "YYYY-MM-DD" or ""
  category: string;
  artistId: string;
};

function toTaskItem(r: {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  targetDate: Date | null;
  category: string | null;
  artistId: string | null;
  completedAt: Date | null;
  artist: { name: string } | null;
}): TaskItem {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    email: r.email,
    targetDate: r.targetDate ? r.targetDate.toISOString().slice(0, 10) : null,
    category: r.category,
    artistId: r.artistId,
    artistName: r.artist?.name || null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

// Open tasks, soonest target date first (tasks with no date last), then
// oldest first — optionally filtered to one artist, same as the Inbox
// list beside it.
export async function getOpenTasks(artistId?: string): Promise<TaskItem[]> {
  const rows = await db.task.findMany({
    where: { completedAt: null, ...(artistId ? { artistId } : {}) },
    orderBy: [{ targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 200,
    include: { artist: { select: { name: true } } },
  });
  return rows.map(toTaskItem);
}

// Completed tasks, most recently completed first — the Done list in the
// right-hand column. Fetched on demand from the client, same as the Sent
// list.
export async function getCompletedTasks(artistId?: string): Promise<TaskItem[]> {
  const rows = await db.task.findMany({
    where: { completedAt: { not: null }, ...(artistId ? { artistId } : {}) },
    orderBy: { completedAt: "desc" },
    take: 200,
    include: { artist: { select: { name: true } } },
  });
  return rows.map(toTaskItem);
}

// Creates a new task, or updates an existing open one. With complete =
// true, the task is also marked completed in the same write — so a task
// can be created and completed in one go without a second round trip.
export async function saveTask(
  input: TaskInput,
  complete = false
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Task name can't be empty." };
  const email = input.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) return { ok: false, error: "That email address doesn't look right." };

  let targetDate: Date | null = null;
  if (input.targetDate) {
    targetDate = new Date(`${input.targetDate}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) return { ok: false, error: "That target date isn't valid." };
  }

  const data = {
    name,
    description: input.description.trim() || null,
    email: email || null,
    targetDate,
    category: input.category.trim() || null,
    artistId: input.artistId || null,
    ...(complete ? { completedAt: new Date() } : {}),
  };

  if (input.id) {
    const existing = await db.task.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existing) return { ok: false, error: "Task not found — it may have been removed." };
    await db.task.update({ where: { id: input.id }, data });
    revalidatePath("/accounts/inbox");
    return { ok: true, id: input.id };
  }

  const created = await db.task.create({ data, select: { id: true } });
  revalidatePath("/accounts/inbox");
  return { ok: true, id: created.id };
}

// Deletes a task, open or completed — from the open Task list (2026-09-27,
// direct request: "need to be able to delete, not just say done") or the
// Done list. That includes the Done entries the app writes itself, e.g.
// "Subscription payments updated" (see markSubscriptionUpToDate).
export async function deleteTask(id: string): Promise<void> {
  await db.task.deleteMany({ where: { id } });
  revalidatePath("/accounts/inbox");
}

export type TaskActivityItem = {
  id: string;
  direction: "IN" | "OUT";
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string | null;
  body: string;
  at: string; // ISO
};

// A task's Activity (2026-09-27): every email sent from it and every reply
// linked back to it, newest first.
export async function getTaskActivity(taskId: string): Promise<TaskActivityItem[]> {
  const [sent, received] = await Promise.all([
    db.outboundEmail.findMany({
      where: { taskId },
      select: { id: true, fromAddress: true, toAddress: true, subject: true, body: true, sentAt: true },
    }),
    db.inboundEmail.findMany({
      where: { taskId },
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        toAddress: true,
        subject: true,
        textBody: true,
        htmlBody: true,
        receivedAt: true,
      },
    }),
  ]);
  const items: TaskActivityItem[] = [
    ...sent.map((r) => ({
      id: r.id,
      direction: "OUT" as const,
      fromAddress: r.fromAddress,
      fromName: null,
      toAddress: r.toAddress,
      subject: r.subject,
      body: r.body || "",
      at: r.sentAt.toISOString(),
    })),
    ...received.map((r) => ({
      id: r.id,
      direction: "IN" as const,
      fromAddress: r.fromAddress,
      fromName: r.fromName,
      toAddress: r.toAddress,
      subject: r.subject,
      body: readableEmailText(r.textBody, r.htmlBody),
      at: r.receivedAt.toISOString(),
    })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
