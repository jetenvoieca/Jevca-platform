"use client";

import type { TaskInput } from "@/lib/actions/tasks";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";

// The task form shown in the Inbox's modal (2026-09-19, CRM Phase 2) —
// purely presentational: the parent (AdminInboxPanel) owns the form state
// and does the saving, since saving also has to refresh the lists behind
// it, and closes the modal once a save succeeds. Save Task is always
// available (it creates a new task, or saves changes to a loaded one);
// Task Completed only appears once the task exists, i.e. was loaded from
// the list.
export default function TaskForm({
  form,
  categories,
  artistOptions,
  saving,
  error,
  onChange,
  onSave,
  onComplete,
}: {
  form: TaskInput;
  categories: string[];
  artistOptions: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<TaskInput>) => void;
  onSave: () => void;
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ActionPanel>
        <ActionButton onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save Task"}
        </ActionButton>
        {form.id && (
          <ActionButton onClick={onComplete} disabled={saving}>
            Task Completed
          </ActionButton>
        )}
      </ActionPanel>
    </div>
  );
}
