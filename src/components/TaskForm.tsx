"use client";

import { useState, type ReactNode } from "react";
import type { TaskInput } from "@/lib/actions/tasks";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import LinkifiedText from "@/components/LinkifiedText";

// The task form shown in the Inbox's modal (2026-09-19, CRM Phase 2) —
// purely presentational: the parent (AdminInboxPanel) owns the form state
// and does the saving, since saving also has to refresh the lists behind
// it. There's no Save button (2026-09-28, direct request): the task saves
// itself when it's closed, and the action buttons save it first too —
// Email (left) and Activity (middle, 2026-09-28) then open the task's
// email or note window (see TaskActivityPanel), Completed (right)
// completes it and closes it.
//
// Layout (2026-10-10, direct request — see mock-up): Target date,
// Category and Owner sit small in the title row; then the name and
// description; then the task's Activity (`activity`, passed in once the
// task exists); and the action buttons last. The email address isn't on
// the form any more — it's typed in the Email window itself.
//
// Links (2026-10-10, direct request): the description shows as text with
// its web addresses clickable; tapping anywhere else on it (or into an
// empty one) turns it into the box to type in, and it goes back to the
// text view once you click away.
export default function TaskForm({
  form,
  categories,
  artistOptions,
  saving,
  error,
  activity,
  onChange,
  onEmail,
  onActivity,
  onComplete,
}: {
  form: TaskInput;
  categories: string[];
  artistOptions: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  activity: ReactNode;
  onChange: (patch: Partial<TaskInput>) => void;
  onEmail: () => void;
  onActivity: () => void;
  onComplete: () => void;
}) {
  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const [editingDescription, setEditingDescription] = useState(!form.description.trim());
  const smallInputCls = "w-full rounded-md border border-neutral-300 px-1.5 py-1 text-xs";
  const smallLabelCls = "mb-0.5 block text-[10px] text-neutral-500";

  // A category removed in Settings after a task was saved with it still
  // shows (rather than silently blanking) until the task is changed.
  const categoryOptions =
    form.category && !categories.includes(form.category) ? [...categories, form.category] : categories;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      {/* Title, with Target date, Category and Owner beside it (under it on
          a phone). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <p className="shrink-0 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:w-24">
          {form.id ? "Edit task" : "New task"}
        </p>
        <div className="grid flex-1 grid-cols-[7.5rem_1fr] gap-2 sm:grid-cols-[7.5rem_7rem_1fr]">
          <div>
            <label className={smallLabelCls}>Target date</label>
            <input
              type="date"
              value={form.targetDate}
              onChange={(e) => onChange({ targetDate: e.target.value })}
              className={smallInputCls}
            />
          </div>
          <div>
            <label className={smallLabelCls}>Category</label>
            <select
              value={form.category}
              onChange={(e) => onChange({ category: e.target.value })}
              className={smallInputCls}
            >
              <option value="">— None —</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={smallLabelCls}>Owner</label>
            <select
              value={form.artistId}
              onChange={(e) => onChange({ artistId: e.target.value })}
              className={smallInputCls}
            >
              <option value="">General (no owner)</option>
              {artistOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <input
        type="text"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Task name"
        className={inputCls}
      />

      {editingDescription ? (
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onBlur={() => setEditingDescription(!form.description.trim())}
          autoFocus={!!form.description.trim()}
          placeholder="Task description"
          rows={8}
          className={inputCls}
        />
      ) : (
        <div
          role="textbox"
          tabIndex={0}
          onClick={() => setEditingDescription(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditingDescription(true);
          }}
          className={`${inputCls} min-h-[11.5rem] cursor-text whitespace-pre-wrap [overflow-wrap:anywhere]`}
        >
          <LinkifiedText text={form.description} />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {activity}

      <div className="pt-3">
        <ActionPanel>
          <div className="flex w-full flex-wrap justify-between gap-3">
            <ActionButton onClick={onEmail} disabled={saving}>
              Email
            </ActionButton>
            <ActionButton onClick={onActivity} disabled={saving}>
              Activity
            </ActionButton>
            <ActionButton onClick={onComplete} disabled={saving}>
              Completed
            </ActionButton>
          </div>
        </ActionPanel>
      </div>
    </div>
  );
}
