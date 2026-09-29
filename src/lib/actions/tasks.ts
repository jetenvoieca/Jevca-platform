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
// sent and the replies that came back (see lib/emailThreading.ts), along
// with the task's notes of what was done (2026-09-28, see TaskNote).

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
// Done list.
export async function deleteTask(id: string): Promise<void> {
  await db.task.deleteMany({ where: { id } });
  revalidatePath("/accounts/inbox");
}

// One entry in a task's Activity: an email sent from it, a reply to one,
// or a note. `at` orders the list, newest first.
export type TaskActivityItem =
  | { kind: "SENT"; id: string; toAddress: string; subject: string | null; body: string; at: string }
  | {
      kind: "REPLY";
      id: string;
      fromAddress: string;
      fromName: string | null;
      subject: string | null;
      body: string;
      at: string;
    }
  | { kind: "NOTE"; id: string; date: string; text: string; at: string };

// A task's Activity (2026-09-27): every email sent from it, every reply
// linked back to it, and its notes (2026-09-28), newest first. A note
// dated the day it was written sorts by when it was written; a note dated
// some other day sits at midday on that day.
export async function getTaskActivity(taskId: string): Promise<TaskActivityItem[]> {
  const [sent, received, notes] = await Promise.all([
    db.outboundEmail.findMany({
      where: { taskId },
      select: { id: true, toAddress: true, subject: true, body: true, sentAt: true },
    }),
    db.inboundEmail.findMany({
      where: { taskId },
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        textBody: true,
        htmlBody: true,
        receivedAt: true,
      },
    }),
    db.taskNote.findMany({
      where: { taskId },
      select: { id: true, date: true, text: true, createdAt: true },
    }),
  ]);
  const items: TaskActivityItem[] = [
    ...sent.map((r) => ({
      kind: "SENT" as const,
      id: r.id,
      toAddress: r.toAddress,
      subject: r.subject,
      body: r.body || "",
      at: r.sentAt.toISOString(),
    })),
    ...received.map((r) => ({
      kind: "REPLY" as const,
      id: r.id,
      fromAddress: r.fromAddress,
      fromName: r.fromName,
      subject: r.subject,
      body: readableEmailText(r.textBody, r.htmlBody),
      at: r.receivedAt.toISOString(),
    })),
    ...notes.map((r) => {
      const date = r.date.toISOString().slice(0, 10);
      const writtenThatDay = r.createdAt.toISOString().slice(0, 10) === date;
      return {
        kind: "NOTE" as const,
        id: r.id,
        date,
        text: r.text,
        at: writtenThatDay ? r.createdAt.toISOString() : `${date}T12:00:00.000Z`,
      };
    }),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export type TaskNoteInput = {
  id: string | null; // null = a new note
  taskId: string;
  date: string; // "YYYY-MM-DD"
  text: string;
};

// Adds a note to a task, or saves changes to one (2026-09-28).
export async function saveTaskNote(
  input: TaskNoteInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Write what was done first." };
  if (!input.date) return { ok: false, error: "Choose a date." };
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "That date isn't valid." };

  if (input.id) {
    const updated = await db.taskNote.updateMany({
      where: { id: input.id, taskId: input.taskId },
      data: { date, text },
    });
    if (updated.count === 0) return { ok: false, error: "Note not found — it may have been deleted." };
    return { ok: true };
  }

  const task = await db.task.findUnique({ where: { id: input.taskId }, select: { id: true } });
  if (!task) return { ok: false, error: "Task not found — it may have been deleted." };
  await db.taskNote.create({ data: { taskId: task.id, date, text } });
  return { ok: true };
}

export async function deleteTaskNote(id: string): Promise<void> {
  await db.taskNote.deleteMany({ where: { id } });
}

// Makes a task from a received email (2026-09-28, direct request): named
// after its subject, with the sender's address and artist, and the email
// linked to it — so it shows in the task's Activity, and replies in that
// conversation link to the task too (see lib/emailThreading.ts). The
// email itself stays in the Inbox. An email already made into a task
// returns that task instead of a second one.
export async function createTaskFromEmail(
  inboundEmailId: string
): Promise<{ ok: true; task: TaskItem } | { ok: false; error: string }> {
  const inbound = await db.inboundEmail.findUnique({
    where: { id: inboundEmailId },
    select: { subject: true, fromAddress: true, fromName: true, artistId: true, taskId: true },
  });
  if (!inbound) return { ok: false, error: "Email not found — it may have been deleted." };

  if (inbound.taskId) {
    const existing = await db.task.findUnique({
      where: { id: inbound.taskId },
      include: { artist: { select: { name: true } } },
    });
    if (existing) return { ok: true, task: toTaskItem(existing) };
  }

  const task = await db.task.create({
    data: {
      name: inbound.subject?.trim() || `Email from ${inbound.fromName || inbound.fromAddress}`,
      email: inbound.fromAddress,
      artistId: inbound.artistId,
    },
    include: { artist: { select: { name: true } } },
  });
  await db.inboundEmail.update({ where: { id: inboundEmailId }, data: { taskId: task.id } });
  revalidatePath("/accounts/inbox");
  return { ok: true, task: toTaskItem(task) };
}
