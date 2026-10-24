"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { TaskInput } from "@/lib/actions/tasks";
import { ActionPanel, ActionButton } from "@/components/ActionPanel";
import LinkifiedText from "@/components/LinkifiedText";
import TaskActionsList, { insertActionLine, newActionLine } from "@/components/TaskActionsList";
import { CopyIcon, CheckIcon } from "@/components/ActionIcons";
import { formatDate } from "@/lib/formatDate";

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
//
// Open email (2026-10-10): a task made from a Personal (Gmail) email has
// a link under its description that reopens that conversation in the
// Personal tab (`onOpenEmail`, null for any other task).
//
// Files (2026-10-11): the task's Files section (`files`, see
// TaskFilesPanel) sits under the description.
//
// Copy (2026-10-14, direct request — selecting text is awkward on an
// iPad): an icon in the description's top right corner copies the whole
// description; it shows a tick for a moment once copied.
//
// Insights (2026-10-13, direct request): the same form shows an Insight
// (`dateAdded` set — the day Keep this was pressed). An insight has Date
// added (read only) and Category in the title row — no Target date or
// Owner — and its buttons are Email, Activity and Make task (back to the
// Task list). A task's buttons are Email, Activity, Keep this (makes it an
// Insight) and Completed.
//
// Actions (2026-10-20, direct request — see mock-up): the Action button
// (last, on tasks and insights) adds an action line under the
// description and puts the cursor in it; see TaskActionsList. The buttons
// sit in columns, three to a row.
//
// Projects (2026-10-24, direct request — see mock-up): a task's open
// action lines can each be made a task of its own (`onMakeActionTask`,
// null on an insight). A task made that way names the project it came
// from under its name (`projectName`), which opens it (`onOpenProject`).
// The gear that makes a task a project sits in the modal's top bar (see
// AdminInboxPanel).
export default function TaskForm({
  form,
  dateAdded,
  projectName,
  categories,
  artistOptions,
  saving,
  error,
  files,
  activity,
  onChange,
  onMakeActionTask,
  onOpenProject,
  onOpenEmail,
  onEmail,
  onActivity,
  onKeep,
  onMakeTask,
  onComplete,
}: {
  form: TaskInput;
  dateAdded: string | null; // "YYYY-MM-DD" — set for an Insight
  projectName: string | null; // the project it was made from
  categories: string[];
  artistOptions: { id: string; name: string }[];
  saving: boolean;
  error: string | null;
  files: ReactNode;
  activity: ReactNode;
  onChange: (patch: Partial<TaskInput>) => void;
  onMakeActionTask: ((actionId: string) => void) | null;
  onOpenProject: () => void;
  onOpenEmail: (() => void) | null;
  onEmail: () => void;
  onActivity: () => void;
  onKeep: () => void;
  onMakeTask: () => void;
  onComplete: () => void;
}) {
  const isInsight = dateAdded !== null;
  const inputCls = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
  const [editingDescription, setEditingDescription] = useState(!form.description.trim());
  const [copied, setCopied] = useState(false);
  // The action line to put the cursor in once it's drawn (a new one).
  const [focusActionId, setFocusActionId] = useState<string | null>(null);
  const addAction = () => {
    const line = newActionLine();
    onChange({ actions: insertActionLine(form.actions, line) });
    setFocusActionId(line.id);
  };
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copyDescription = () => {
    navigator.clipboard
      .writeText(form.description)
      .then(() => setCopied(true))
      .catch(() => alert("Couldn't copy — your browser didn't allow it."));
  };
  // One height for all three, and min-w-0 so none can push past its
  // column. The date box also drops Safari's own look (appearance-none),
  // which on an iPad made it wider and taller than its column (2026-10-11).
  const smallInputCls = "h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-1.5 text-xs";
  const dateInputCls = `${smallInputCls} appearance-none text-left [&::-webkit-date-and-time-value]:text-left`;
  const smallLabelCls = "mb-0.5 block text-[10px] text-neutral-500";

  // A category removed in Settings after a task was saved with it still
  // shows (rather than silently blanking) until the task is changed.
  const categoryOptions =
    form.category && !categories.includes(form.category) ? [...categories, form.category] : categories;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      {/* Title, with Target date (an insight: Date added), Category and
          Owner (not on an insight) beside it — under it on a phone. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <p className="shrink-0 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:w-24">
          {isInsight ? "Insight" : form.id ? "Edit task" : "New task"}
        </p>
        <div className="grid flex-1 grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,8rem)_minmax(0,1fr)]">
          {dateAdded !== null ? (
            <div>
              <label className={smallLabelCls}>Date added</label>
              <p className={`${smallInputCls} flex items-center bg-neutral-50 text-neutral-600`}>
                {formatDate(dateAdded)}
              </p>
            </div>
          ) : (
            <div>
              <label className={smallLabelCls}>Target date</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => onChange({ targetDate: e.target.value })}
                className={dateInputCls}
              />
            </div>
          )}
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
          {!isInsight && (
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
          )}
        </div>
      </div>

      <input
        type="text"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={isInsight ? "Insight name" : "Task name"}
        className={inputCls}
      />

      {projectName && (
        <p className="text-xs text-neutral-500">
          From project{" "}
          <button
            type="button"
            onClick={onOpenProject}
            disabled={saving}
            className="text-blue-700 underline hover:text-blue-900 disabled:opacity-50"
          >
            {projectName}
          </button>
        </p>
      )}

      {/* The description, with Copy in its top right corner (pr-9 keeps the
          text clear of it). Copy doesn't take the focus, so pressing it
          while typing leaves the box open. */}
      <div className="relative">
      {form.description.trim() && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={copyDescription}
          title="Copy description"
          aria-label="Copy description"
          className="absolute right-1.5 top-1.5 z-10 rounded-md bg-white/90 p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      )}
      {editingDescription ? (
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onBlur={() => setEditingDescription(!form.description.trim())}
          autoFocus={!!form.description.trim()}
          placeholder={isInsight ? "Insight description" : "Task description"}
          rows={8}
          className={`${inputCls} pr-9`}
        />
      ) : (
        <div
          role="textbox"
          tabIndex={0}
          onClick={() => setEditingDescription(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditingDescription(true);
          }}
          className={`${inputCls} min-h-[11.5rem] cursor-text whitespace-pre-wrap pr-9 [overflow-wrap:anywhere]`}
        >
          <LinkifiedText text={form.description} />
        </div>
      )}
      </div>

      <TaskActionsList
        actions={form.actions}
        focusId={focusActionId}
        busy={saving}
        onChange={(actions) => onChange({ actions })}
        onFocusId={setFocusActionId}
        onMakeTask={onMakeActionTask}
      />

      {onOpenEmail && (
        <button
          type="button"
          onClick={onOpenEmail}
          disabled={saving}
          className="text-sm text-blue-700 underline hover:text-blue-900 disabled:opacity-50"
        >
          Open email in Personal
        </button>
      )}

      {files}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {activity}

      <div className="pt-3">
        <ActionPanel>
          <div className="grid w-full grid-cols-[repeat(auto-fill,10rem)] justify-between gap-3">
            <ActionButton onClick={onEmail} disabled={saving}>
              Email
            </ActionButton>
            <ActionButton onClick={onActivity} disabled={saving}>
              Activity
            </ActionButton>
            {isInsight ? (
              <ActionButton onClick={onMakeTask} disabled={saving}>
                Make task
              </ActionButton>
            ) : (
              <>
                <ActionButton onClick={onKeep} disabled={saving}>
                  Keep this
                </ActionButton>
                <ActionButton onClick={onComplete} disabled={saving}>
                  Completed
                </ActionButton>
              </>
            )}
            <ActionButton onClick={addAction} disabled={saving}>
              Action
            </ActionButton>
          </div>
        </ActionPanel>
      </div>
    </div>
  );
}
