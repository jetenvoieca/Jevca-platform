"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
// description: images as thumbnails, other files by name, with a bin to
// delete. Images and PDFs open in a viewer over the task with a Close
// button (2026-10-11 — a new tab had no way back in the iPad's home-screen
// app); other files download. All served by /api/task-file/<id>. Add files picks
// any files — on an iPad it also offers the camera. A new task is saved
// first (`ensureTaskId`), the same as its Email and Activity buttons.
const THUMBNAIL_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const PDF_TYPE = "application/pdf";

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
  // The image or PDF open in the viewer.
  const [viewing, setViewing] = useState<TaskFileItem | null>(null);

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
              <button type="button" onClick={() => setViewing(f)} title={f.filename}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/task-file/${f.id}`}
                  alt={f.filename}
                  className="h-20 w-20 rounded-md border border-neutral-200 object-cover"
                />
              </button>
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
              {f.contentType === PDF_TYPE ? (
                <button
                  type="button"
                  onClick={() => setViewing(f)}
                  className="min-w-0 truncate text-left text-neutral-800 underline hover:text-neutral-600"
                >
                  {f.filename}
                </button>
              ) : (
                <a
                  href={`/api/task-file/${f.id}`}
                  download={f.filename}
                  className="min-w-0 truncate text-neutral-800 underline hover:text-neutral-600"
                >
                  {f.filename}
                </a>
              )}
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

      {/* ---- Viewer: over the task, above everything (as PopupWindow) ---- */}
      {viewing &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex flex-col bg-black/80 p-4"
            onClick={() => setViewing(null)}
          >
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
              <p className="min-w-0 truncate text-sm text-white">{viewing.filename}</p>
              <span className="flex shrink-0 gap-2">
                <a
                  href={`/api/task-file/${viewing.id}`}
                  download={viewing.filename}
                  className="rounded-md border border-white/40 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-200"
                >
                  Close
                </button>
              </span>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {viewing.contentType === PDF_TYPE ? (
                <iframe
                  title={viewing.filename}
                  src={`/api/task-file/${viewing.id}`}
                  className="h-full w-full max-w-4xl rounded-md bg-white"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/task-file/${viewing.id}`}
                  alt={viewing.filename}
                  className="max-h-full max-w-full rounded-md object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
