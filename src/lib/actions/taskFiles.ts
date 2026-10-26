"use server";

import { requireAdmin } from "@/lib/currentUser";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { deleteFromR2, getPresignedUploadUrl } from "@/lib/r2";
import { sanitizeFilename } from "@/lib/sanitizeFilename";

// Files and images on a task (2026-10-11, direct request) — see the
// TaskFile model. The browser uploads each file straight to R2 (so size
// isn't limited by Netlify's request ceiling): requestTaskFileUpload
// gives it a short-lived address, then addTaskFile records it.

const MAX_SIZE = 25 * 1024 * 1024;

export type TaskFileItem = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string; // ISO
};

export async function getTaskFiles(taskId: string): Promise<TaskFileItem[]> {
  await requireAdmin();
  const rows = await db.taskFile.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    contentType: r.contentType,
    size: r.size,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function requestTaskFileUpload(
  taskId: string,
  filename: string,
  contentType: string,
  size: number
): Promise<{ ok: true; uploadUrl: string; key: string } | { ok: false; error: string }> {
  await requireAdmin();
  if (size > MAX_SIZE) return { ok: false, error: `"${filename}" is over 25 MB.` };
  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return { ok: false, error: "Task not found — it may have been deleted." };
  const key = `tasks/${taskId}/${randomUUID()}-${sanitizeFilename(filename)}`;
  return { ok: true, uploadUrl: await getPresignedUploadUrl(key, contentType || "application/octet-stream"), key };
}

export async function addTaskFile(input: {
  taskId: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  // Only a key this task was given (see requestTaskFileUpload).
  if (!input.key.startsWith(`tasks/${input.taskId}/`)) return { ok: false, error: "That upload doesn't belong to this task." };
  await db.taskFile.create({
    data: {
      taskId: input.taskId,
      r2Key: input.key,
      filename: input.filename,
      contentType: input.contentType || "application/octet-stream",
      size: input.size,
    },
  });
  return { ok: true };
}

export async function deleteTaskFile(id: string): Promise<void> {
  await requireAdmin();
  const file = await db.taskFile.findUnique({ where: { id }, select: { r2Key: true } });
  if (!file) return;
  await deleteFromR2(file.r2Key);
  await db.taskFile.delete({ where: { id } });
}
