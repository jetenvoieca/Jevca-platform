"use client";

import type { TaskInput } from "@/lib/actions/tasks";
import type { ComposeRecipient } from "@/lib/actions/adminEmail";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";

// The task form shown in the Inbox's modal (2026-09-19, CRM Phase 2) —
// purely presentational: the parent (AdminInboxPanel) owns the form state
// and does the saving, since saving also has to refresh the lists behind
// it. There's no Save button (2026-09-28, direct request): the task saves
// itself when it's closed, and the two action buttons save it first too —
// Email (left) then opens the task's email window (see TaskEmailPanel),
// Completed (right) completes it and closes it.
//
// The Email field (2026-09-27) is the address that email window starts
// with — typed, or picked from the same artists and contacts list as the
// Inbox's New message.
export default function TaskForm({
  form,
  categories,
  artistOptions,
  composeRecipients,
  saving,
  error,
  onChange,
  onEmail,
  onComplete,
}: {
  form: TaskInput;
  categories: string[];
  artistOptions: { id: string; name: string }[];
  composeRecipients: ComposeRecipient[];
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<TaskInput>) => void;
  onEmail: () => void;
  onComplete: () => void;
}) {
  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs text-neutral-500";

  // A category removed in Settings after a task was saved with it still
  // shows (rather than silently blanking) until the task is changed.
  const categoryOptions =
    form.category && !categories.includes(form.category) ? [...categories, form.category] : categories;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {form.id ? "Edit task" : "New task"}
      </p>

      <input
        type="text"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Task name"
        className={inputCls}
      />

      <textarea
        value={form.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Task description"
        rows={8}
        className={inputCls}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Target date</label>
          <input
            type="date"
            value={form.targetDate}
            onChange={(e) => onChange({ targetDate: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select
            value={form.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className={inputCls}
          >
            <option value="">— None —</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Artist</label>
        <select
          value={form.artistId}
          onChange={(e) => onChange({ artistId: e.target.value })}
          className={inputCls}
        >
          <option value="">General (no artist)</option>
          {artistOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Email</label>
        <input
          list="task-email-recipients"
          type="email"
          value={form.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="Type an address, or pick from the list"
          className={inputCls}
        />
        <datalist id="task-email-recipients">
          {composeRecipients.map((r) => (
            <option key={`${r.artistId || "c"}-${r.email}`} value={r.email}>
              {r.label}
            </option>
          ))}
        </datalist>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ActionPanel>
        <div className="flex w-full justify-between gap-3">
          <ActionButton onClick={onEmail} disabled={saving}>
            Email
          </ActionButton>
          <ActionButton onClick={onComplete} disabled={saving}>
            Completed
          </ActionButton>
        </div>
      </ActionPanel>
    </div>
  );
}
