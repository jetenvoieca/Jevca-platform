"use server";

import { requireAdmin } from "@/lib/currentUser";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { readableEmailText } from "@/lib/emailText";
import { deleteFromR2 } from "@/lib/r2";
import { parisToday, parisWeekStart } from "@/lib/parisTime";

// Tasks on the admin Inbox's Task view (2026-09-19, CRM Phase 2). An
// open task has completedAt null; completing it sets completedAt, which
// is what the Done list reads. See the Task model in schema.prisma.
//
// A task can also hold an email address and send email from itself
// (2026-09-27) — sending goes through sendAdminEmail (actions/
// adminEmail.ts) with the task's id; getTaskActivity below lists what was
// sent and the replies that came back (see lib/emailThreading.ts), along
// with the task's notes of what was done (2026-09-28, see TaskNote).
//
// Today (2026-10-09, direct request): a task can be marked Today, which
// puts it in a tinted panel at the top of the open list until midnight
// Paris time — see Task.todayOn and setTaskToday. This week (2026-10-10)
// works the same way, in a second panel under it, until midnight on
// Sunday — see Task.weekOf and setTaskThisWeek.
//
// Insights (2026-10-13, direct request): "Keep this" turns a task into an
// Insight — the same record, with its files and Activity, kept for its
// information in the Inbox's Insight pill rather than cluttering the Task
// list. See Task.keptOn, keepTask and makeTaskFromInsight. Every list and
// Today / This week action here leaves insights out.
//
// Actions (2026-10-20, direct request): a task (or insight) can hold a
// list of action lines, each a tick box and text — see TaskAction. They
// come with every TaskItem and are saved with the task by saveTask.
//
// Projects (2026-10-24, direct request — see mock-up): the gear on a task
// flags it as a project (Task.isProject). Any open action line can be
// made into a task of its own, set for today (makeTaskFromAction) — the
// line stays, and is ticked when that task is completed and unticked if
// it's reinstated (see setActionDone).

// One action line. `id` is made by the form when the line is added and
// kept when it's saved, so a line is the same record from the start —
// which the task made from it relies on. `madeTaskId`: the task made from
// it, if any.
export type TaskActionLine = { id: string; text: string; done: boolean; madeTaskId: string | null };

const MAX_ACTIONS = 100;
const MAX_ACTION_LENGTH = 500;
// A line's id: a cuid (older lines) or the form's random UUID.
const ACTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

// What every task query loads with the task: its owner's name, its action
// lines in order (each with the task made from it), and the project it was
// made from, if any.
const TASK_INCLUDE = {
  artist: { select: { name: true } },
  actions: {
    orderBy: { position: "asc" as const },
    select: { id: true, text: true, done: true, madeTask: { select: { id: true } } },
  },
  fromAction: { select: { task: { select: { id: true, name: true } } } },
};

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
  todayOn: string | null; // "YYYY-MM-DD", Paris — in the Today panel only while it's today
  weekOf: string | null; // "YYYY-MM-DD", a Monday — in the This week panel only during that week
  gmailThreadId: string | null; // the Personal (Gmail) conversation it was made from
  keptOn: string | null; // "YYYY-MM-DD", Paris — set = an Insight (its Date added)
  isProject: boolean;
  project: { id: string; name: string } | null; // the project it was made from
  actions: TaskActionLine[];
};

// What the task form submits — every field a plain string (empty string
// = not set), so the form's own state can be passed straight through.
// The task's email address isn't on the form (2026-10-10, direct
// request): it's set when a task is made from an email, and from then on
// by sending from the task's Email window (see sendAdminEmail).
export type TaskInput = {
  id: string | null; // null = a new task
  name: string;
  description: string;
  targetDate: string; // "YYYY-MM-DD" or ""
  category: string;
  artistId: string;
  isProject: boolean;
  actions: TaskActionLine[];
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
  todayOn: Date | null;
  weekOf: Date | null;
  gmailThreadId: string | null;
  keptOn: Date | null;
  isProject: boolean;
  artist: { name: string } | null;
  actions: { id: string; text: string; done: boolean; madeTask: { id: string } | null }[];
  fromAction: { task: { id: string; name: string } } | null;
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
    todayOn: r.todayOn ? r.todayOn.toISOString().slice(0, 10) : null,
    weekOf: r.weekOf ? r.weekOf.toISOString().slice(0, 10) : null,
    gmailThreadId: r.gmailThreadId,
    keptOn: r.keptOn ? r.keptOn.toISOString().slice(0, 10) : null,
    isProject: r.isProject,
    project: r.fromAction?.task ?? null,
    actions: r.actions.map((a) => ({ id: a.id, text: a.text, done: a.done, madeTaskId: a.madeTask?.id ?? null })),
  };
}

// Open tasks: projects after the other tasks, then soonest target date
// first (tasks with no date last), then oldest first.
export async function getOpenTasks(): Promise<TaskItem[]> {
  await requireAdmin();
  const rows = await db.task.findMany({
    where: { completedAt: null, keptOn: null },
    orderBy: [{ isProject: "asc" }, { targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 200,
    include: TASK_INCLUDE,
  });
  return rows.map(toTaskItem);
}

// Completed tasks, most recently completed first — the Done list in the
// right-hand column. Fetched on demand from the client, same as the Sent
// list.
export async function getCompletedTasks(): Promise<TaskItem[]> {
  await requireAdmin();
  const rows = await db.task.findMany({
    where: { completedAt: { not: null }, keptOn: null },
    orderBy: { completedAt: "desc" },
    take: 200,
    include: TASK_INCLUDE,
  });
  return rows.map(toTaskItem);
}

// Insights, newest added first — the Insight pill's list.
export async function getInsights(): Promise<TaskItem[]> {
  await requireAdmin();
  const rows = await db.task.findMany({
    where: { keptOn: { not: null } },
    orderBy: [{ keptOn: "desc" }, { updatedAt: "desc" }],
    take: 500,
    include: TASK_INCLUDE,
  });
  return rows.map(toTaskItem);
}

// Creates a new task, or updates an existing open one. With complete =
// true, the task is also marked completed in the same write — so a task
// can be created and completed in one go without a second round trip —
// and the action line it was made from, if any, is ticked.
//
// Its action lines are saved in the order given: lines kept are updated
// in place (so a task made from one stays linked), new ones are added
// with the form's id, and lines no longer there are removed.
export async function saveTask(
  input: TaskInput,
  complete = false
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Task name can't be empty." };

  let targetDate: Date | null = null;
  if (input.targetDate) {
    targetDate = new Date(`${input.targetDate}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) return { ok: false, error: "That target date isn't valid." };
  }

  // Action lines, in the order shown; empty lines are dropped.
  const actionRows = input.actions
    .map((a) => ({ id: a.id, text: a.text.trim(), done: a.done }))
    .filter((a) => a.text)
    .map((a, position) => ({ ...a, position }));
  if (actionRows.length > MAX_ACTIONS) return { ok: false, error: `A task can have up to ${MAX_ACTIONS} actions.` };
  if (actionRows.some((a) => a.text.length > MAX_ACTION_LENGTH)) {
    return { ok: false, error: `An action can be up to ${MAX_ACTION_LENGTH} characters.` };
  }
  const actionIds = actionRows.map((a) => a.id);
  if (actionIds.some((id) => !ACTION_ID.test(id)) || new Set(actionIds).size !== actionIds.length) {
    return { ok: false, error: "The action lines couldn't be saved — close the task and open it again." };
  }
  // A line's id must not already belong to another task.
  const clash = await db.taskAction.findFirst({
    where: { id: { in: actionIds }, ...(input.id ? { taskId: { not: input.id } } : {}) },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "The action lines couldn't be saved — close the task and open it again." };

  const data = {
    name,
    description: input.description.trim() || null,
    targetDate,
    category: input.category.trim() || null,
    artistId: input.artistId || null,
    isProject: input.isProject,
    ...(complete ? { completedAt: new Date() } : {}),
  };

  if (input.id) {
    const existing = await db.task.findUnique({ where: { id: input.id }, select: { fromActionId: true } });
    if (!existing) return { ok: false, error: "Task not found — it may have been removed." };
    await db.task.update({
      where: { id: input.id },
      data: {
        ...data,
        actions: {
          deleteMany: { id: { notIn: actionIds } },
          upsert: actionRows.map(({ id, ...row }) => ({ where: { id }, create: { id, ...row }, update: row })),
        },
      },
    });
    if (complete && existing.fromActionId) await setActionDone(existing.fromActionId, true);
    revalidatePath("/accounts/inbox");
    return { ok: true, id: input.id };
  }

  const created = await db.task.create({
    data: { ...data, actions: { create: actionRows } },
    select: { id: true },
  });
  revalidatePath("/accounts/inbox");
  return { ok: true, id: created.id };
}

// Marks an open task Today (for today's date in Paris), or takes it off
// with today = false.
export async function setTaskToday(id: string, today: boolean): Promise<void> {
  await requireAdmin();
  await db.task.updateMany({
    where: { id, completedAt: null, keptOn: null },
    data: { todayOn: today ? new Date(`${parisToday()}T00:00:00.000Z`) : null },
  });
  revalidatePath("/accounts/inbox");
}

// Marks an open task This week (the current Paris week), or takes it off
// with thisWeek = false — which also clears a past Today, since an
// unfinished Today task shows in This week (see AdminInboxPanel).
export async function setTaskThisWeek(id: string, thisWeek: boolean): Promise<void> {
  await requireAdmin();
  await db.task.updateMany({
    where: { id, completedAt: null, keptOn: null },
    data: thisWeek
      ? { weekOf: new Date(`${parisWeekStart(parisToday())}T00:00:00.000Z`) }
      : { weekOf: null, todayOn: null },
  });
  revalidatePath("/accounts/inbox");
}

// Moves a task from Today to This week (2026-10-10, direct request) —
// off Today's panel and into This week's, in one step.
export async function moveTaskToThisWeek(id: string): Promise<void> {
  await requireAdmin();
  await db.task.updateMany({
    where: { id, completedAt: null, keptOn: null },
    data: { todayOn: null, weekOf: new Date(`${parisWeekStart(parisToday())}T00:00:00.000Z`) },
  });
  revalidatePath("/accounts/inbox");
}

// Keep this (2026-10-13): makes a task, open or completed, an Insight
// dated today (Paris). An insight has no owner, target date, Today / This
// week, completion or project flag, so those are cleared; its name, description,
// category, email address, files and Activity stay.
export async function keepTask(id: string): Promise<void> {
  await requireAdmin();
  await db.task.updateMany({
    where: { id, keptOn: null },
    data: {
      keptOn: new Date(`${parisToday()}T00:00:00.000Z`),
      artistId: null,
      targetDate: null,
      todayOn: null,
      weekOf: null,
      completedAt: null,
      isProject: false,
    },
  });
  revalidatePath("/accounts/inbox");
}

// Make task (2026-10-13): puts an Insight back on the open Task list.
export async function makeTaskFromInsight(id: string): Promise<void> {
  await requireAdmin();
  await db.task.updateMany({ where: { id, keptOn: { not: null } }, data: { keptOn: null } });
  revalidatePath("/accounts/inbox");
}

// Reinstates a completed task (2026-09-28, direct request — for one
// completed by mistake): it moves from the Done list back to the open
// list, with its details, emails and notes untouched.
// The action line it was made from, if any, is unticked.
export async function reopenTask(id: string): Promise<void> {
  await requireAdmin();
  const task = await db.task.findFirst({
    where: { id, completedAt: { not: null } },
    select: { fromActionId: true },
  });
  if (!task) return;
  await db.task.update({ where: { id }, data: { completedAt: null } });
  if (task.fromActionId) await setActionDone(task.fromActionId, false);
  revalidatePath("/accounts/inbox");
}

// Makes a task from an open action line (2026-10-24, direct request — the
// clipboard icon on the line): named after the line, with its task's
// Category and Owner, a target date of today and marked Today. The line
// stays where it is, linked to the new task; a line can only be made into
// one task.
export async function makeTaskFromAction(
  actionId: string
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  await requireAdmin();
  const action = await db.taskAction.findUnique({
    where: { id: actionId },
    select: {
      text: true,
      done: true,
      madeTask: { select: { id: true } },
      task: { select: { category: true, artistId: true } },
    },
  });
  if (!action) return { ok: false, error: "Action not found — it may have been removed." };
  if (action.madeTask) return { ok: false, error: "This action is already a task." };
  if (action.done) return { ok: false, error: "This action is already done." };

  const today = new Date(`${parisToday()}T00:00:00.000Z`);
  try {
    const created = await db.task.create({
      data: {
        name: action.text,
        category: action.task.category,
        artistId: action.task.artistId,
        targetDate: today,
        todayOn: today,
        fromActionId: actionId,
      },
      select: { id: true },
    });
    revalidatePath("/accounts/inbox");
    return { ok: true, taskId: created.id };
  } catch (e) {
    // Made into a task a moment ago (Task.fromActionId is unique).
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "This action is already a task." };
    throw e;
  }
}

// Ticks or unticks an action line, moving it the way the form does: a
// ticked line to the bottom, an unticked one to the end of the open lines.
async function setActionDone(actionId: string, done: boolean): Promise<void> {
  const line = await db.taskAction.findUnique({ where: { id: actionId }, select: { taskId: true, done: true } });
  if (!line || line.done === done) return;
  const lines = await db.taskAction.findMany({
    where: { taskId: line.taskId },
    orderBy: { position: "asc" },
    select: { id: true, done: true },
  });
  const rest = lines.filter((l) => l.id !== actionId);
  const at = done ? rest.length : rest.filter((l) => !l.done).length;
  const ordered = [...rest.slice(0, at).map((l) => l.id), actionId, ...rest.slice(at).map((l) => l.id)];
  await db.$transaction(
    ordered.map((id, position) =>
      db.taskAction.update({ where: { id }, data: id === actionId ? { done, position } : { position } })
    )
  );
}

// Deletes a task, open or completed — from the open Task list (2026-09-27,
// direct request: "need to be able to delete, not just say done"), the
// Done list or the Insight list.
// Its files (2026-10-11) are removed from storage first; their rows go
// with the task.
export async function deleteTask(id: string): Promise<void> {
  await requireAdmin();
  const files = await db.taskFile.findMany({ where: { taskId: id }, select: { r2Key: true } });
  await Promise.all(files.map((f) => deleteFromR2(f.r2Key)));
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const inbound = await db.inboundEmail.findUnique({
    where: { id: inboundEmailId },
    select: { subject: true, fromAddress: true, fromName: true, artistId: true, taskId: true },
  });
  if (!inbound) return { ok: false, error: "Email not found — it may have been deleted." };

  if (inbound.taskId) {
    const existing = await db.task.findUnique({
      where: { id: inbound.taskId },
      include: TASK_INCLUDE,
    });
    if (existing) return { ok: true, task: toTaskItem(existing) };
  }

  const task = await db.task.create({
    data: {
      name: inbound.subject?.trim() || `Email from ${inbound.fromName || inbound.fromAddress}`,
      email: inbound.fromAddress,
      artistId: inbound.artistId,
    },
    include: TASK_INCLUDE,
  });
  await db.inboundEmail.update({ where: { id: inboundEmailId }, data: { taskId: task.id } });
  revalidatePath("/accounts/inbox");
  return { ok: true, task: toTaskItem(task) };
}

// Makes a task from a Personal (Gmail) conversation (2026-10-10, direct
// request — "to deal with the email later"): named after its subject, its
// summary line as the description (for notes to go under), the other
// party's address for the task's Email window, and the conversation
// remembered so the task's Open email reopens it in the Personal tab. The
// email stays in Gmail; nothing of it is stored beyond that. A
// conversation already made into a task returns that task instead.
export async function createTaskFromGmail(input: {
  threadId: string;
  subject: string;
  summary: string;
  name: string | null;
  address: string;
}): Promise<{ ok: true; task: TaskItem } | { ok: false; error: string }> {
  await requireAdmin();
  if (!input.threadId) return { ok: false, error: "Email not found." };
  const existing = await db.task.findUnique({ where: { gmailThreadId: input.threadId }, include: TASK_INCLUDE });
  if (existing) return { ok: true, task: toTaskItem(existing) };

  const task = await db.task.create({
    data: {
      name: input.subject.trim() || `Email from ${input.name || input.address}`,
      description: input.summary.trim() || null,
      email: input.address.trim() || null,
      gmailThreadId: input.threadId,
    },
    include: TASK_INCLUDE,
  });
  revalidatePath("/accounts/inbox");
  return { ok: true, task: toTaskItem(task) };
}

// One task, open, completed or an Insight — for an email's Open task
// (2026-10-11).
export async function getTask(id: string): Promise<TaskItem | null> {
  await requireAdmin();
  const row = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  return row ? toTaskItem(row) : null;
}

// Which Personal (Gmail) conversations already have a task, as
// conversation id → task id (2026-10-11) — so the Personal tab offers
// Open task / Remove task on them instead of Make task.
export async function getGmailTaskLinks(): Promise<Record<string, string>> {
  await requireAdmin();
  const rows = await db.task.findMany({
    where: { gmailThreadId: { not: null } },
    select: { id: true, gmailThreadId: true },
  });
  return Object.fromEntries(rows.map((r) => [r.gmailThreadId as string, r.id]));
}
