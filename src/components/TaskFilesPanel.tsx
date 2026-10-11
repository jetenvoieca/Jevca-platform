"use client";

import { useEffect, useRef, useState } from "react";
import {
  addTaskFile,
  deleteTaskFile,
  getTaskFiles,
  requestTaskFileUpload,
  type TaskFileItem,
} from "@/lib/actions/taskFiles";
import { putToR2 } from "@/lib/putToR2";
import { formatFileSize } from "@/components/EmailBody";

// A task's Files section (2026-10-11, direct request), under its
// description: images as thumbnails, other files by name, each opening in
// a new tab (/api/task-file/<id>), with a bin to delete. Add files picks
// any files — on an iPad it also offers the camera. A new task is saved
// first (`ensureTaskId`), the same as its Email and Activity buttons.
const THUMBNAIL_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export default function TaskFilesPanel({
  taskId,
  ensureTaskId,
}: {
  taskId: string | null;
  ensureTaskId: () => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<TaskFileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (id: string) =>
    getTaskFiles(id)
      .then(setFiles)
      .catch(() => setError("The files couldn't be loaded."));

  useEffect(() => {
    if (taskId) load(taskId);
  }, [taskId]);

  const handleChosen = async (chosen: FileList | null) => {
    if (!chosen || chosen.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const id = taskId ?? (await ensureTaskId());
      if (!id) return; // Couldn't be saved — the reason shows under the form.
      for (const file of Array.from(chosen)) {
        const step = await requestTaskFileUpload(id, file.name, file.type, file.size);
        if (!step.ok) {
          setError(step.error);
          continue;
        }
        await putToR2(step.uploadUrl, file, file.type || "application/octet-stream");
        const added = await addTaskFile({
          taskId: id,
          key: step.key,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });
        if (!added.ok) setError(added.error);
      }
      await load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload didn't work — try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (file: TaskFileItem) => {
    if (!confirm(`Delete "${file.filename}"? This can't be undone.`)) return;
    await deleteTaskFile(file.id);
    setFiles((list) => list.filter((f) => f.id !== file.id));
  };

  const images = files.filter((f) => THUMBNAIL_TYPES.has(f.contentType));
  const others = files.filter((f) => !THUMBNAIL_TYPES.has(f.contentType));
  const binCls =
    "rounded px-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Files</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Add files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleChosen(e.target.files)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <div key={f.id} className="group relative">
              <a href={`/api/task-file/${f.id}`} target="_blank" rel="noreferrer" title={f.filename}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/task-file/${f.id}`}
                  alt={f.filename}
                  className="h-20 w-20 rounded-md border border-neutral-200 object-cover"
                />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(f)}
                title="Delete"
                aria-label={`Delete ${f.filename}`}
                className="absolute right-1 top-1 rounded bg-white/90 px-1 text-xs text-neutral-600 shadow hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {others.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <a
                href={`/api/task-file/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-neutral-800 underline hover:text-neutral-600"
              >
                {f.filename}
              </a>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-neutral-400">{formatFileSize(f.size)}</span>
                <button type="button" onClick={() => handleDelete(f)} className={binCls}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
