"use client";

import { useEffect, useRef } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { TaskActionLine } from "@/lib/actions/tasks";
import { ActionTaskIcon } from "@/components/ActionIcons";
import { PROJECT_FILL, PROJECT_INK } from "@/lib/projectColours";

// A task's action lines (2026-10-20, direct request — see mock-up): each a
// tick box and a line of text, under the description. Open lines come
// first and are put in order by dragging their grip; a ticked line moves
// to the bottom (greyed and crossed out), and goes back to the end of the
// open lines if unticked. Enter adds a line under the one being typed in;
// × removes a line. Empty lines are dropped when the task is saved.
//
// The parent owns the list (it's part of the task form, saved with the
// task); `focusId` is the line to put the cursor in once it's drawn —
// set by the form's Action button and by Enter here.
//
// Make task (2026-10-24, direct request — see mock-up): an open line has
// a clipboard icon on its right that makes it a task of its own, set for
// today (`onMakeTask`, null where lines can't be made into tasks). Once
// made, the icon is coloured and can't be pressed again.

export function newActionLine(): TaskActionLine {
  return { id: crypto.randomUUID(), text: "", done: false, madeTaskId: null };
}

// Puts `line` after `afterId`, or at the end of the open lines.
export function insertActionLine(
  actions: TaskActionLine[],
  line: TaskActionLine,
  afterId: string | null = null
): TaskActionLine[] {
  const after = afterId ? actions.findIndex((a) => a.id === afterId) : -1;
  const at = after >= 0 ? after + 1 : actions.filter((a) => !a.done).length;
  return [...actions.slice(0, at), line, ...actions.slice(at)];
}

export default function TaskActionsList({
  actions,
  focusId,
  busy,
  onChange,
  onFocusId,
  onMakeTask,
}: {
  actions: TaskActionLine[];
  focusId: string | null;
  busy: boolean;
  onChange: (actions: TaskActionLine[]) => void;
  onFocusId: (id: string | null) => void;
  onMakeTask: ((id: string) => void) | null;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const open = actions.filter((a) => !a.done);
  const done = actions.filter((a) => a.done);

  if (actions.length === 0) return null;

  const setText = (id: string, text: string) =>
    onChange(actions.map((a) => (a.id === id ? { ...a, text } : a)));

  const toggle = (id: string) => {
    const line = actions.find((a) => a.id === id);
    if (!line) return;
    const rest = actions.filter((a) => a.id !== id);
    const changed = { ...line, done: !line.done };
    onChange(changed.done ? [...rest, changed] : insertActionLine(rest, changed));
  };

  const remove = (id: string) => onChange(actions.filter((a) => a.id !== id));

  const addAfter = (id: string) => {
    const line = newActionLine();
    onChange(insertActionLine(actions, line, id));
    onFocusId(line.id);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = open.findIndex((a) => a.id === active.id);
    const to = open.findIndex((a) => a.id === over.id);
    if (from < 0 || to < 0) return;
    onChange([...arrayMove(open, from, to), ...done]);
  };

  const rowProps = (a: TaskActionLine) => ({
    line: a,
    focus: focusId === a.id,
    busy,
    onFocused: () => onFocusId(null),
    onText: (text: string) => setText(a.id, text),
    onToggle: () => toggle(a.id),
    onRemove: () => remove(a.id),
    onEnter: () => addAfter(a.id),
    onMakeTask: onMakeTask && !a.done ? () => onMakeTask(a.id) : null,
  });

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={open.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {open.map((a) => (
            <SortableActionRow key={a.id} {...rowProps(a)} />
          ))}
        </SortableContext>
      </DndContext>
      {done.map((a) => (
        <ActionRow key={a.id} {...rowProps(a)} />
      ))}
    </div>
  );
}

type RowProps = {
  line: TaskActionLine;
  focus: boolean;
  busy: boolean;
  onFocused: () => void;
  onText: (text: string) => void;
  onToggle: () => void;
  onRemove: () => void;
  onEnter: () => void;
  onMakeTask: (() => void) | null;
};

// An open line — draggable by its grip.
function SortableActionRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.line.id });
  return (
    <ActionRow
      {...props}
      rowRef={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
      }}
      dragging={isDragging}
      grip={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          className="flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-neutral-300 hover:text-neutral-500 active:cursor-grabbing"
        >
          <GripIcon />
        </button>
      }
    />
  );
}

function ActionRow({
  line,
  focus,
  busy,
  onFocused,
  onText,
  onToggle,
  onRemove,
  onEnter,
  onMakeTask,
  rowRef,
  style,
  dragging = false,
  grip,
}: RowProps & {
  rowRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  dragging?: boolean;
  grip?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focus) return;
    inputRef.current?.focus();
    onFocused();
  }, [focus, onFocused]);

  return (
    <div
      ref={rowRef}
      style={style}
      className={`group flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1 ${
        dragging ? "shadow-md" : ""
      }`}
    >
      {/* A ticked line has no grip; the space keeps its tick box in line. */}
      {grip ?? <span className="w-4 shrink-0" />}
      <input
        type="checkbox"
        checked={line.done}
        onChange={onToggle}
        aria-label={line.done ? "Mark not done" : "Mark done"}
        className="h-4 w-4 shrink-0 accent-neutral-600"
      />
      <input
        ref={inputRef}
        type="text"
        value={line.text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder="Action"
        maxLength={500}
        className={`min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-400 ${
          line.done ? "text-neutral-400 line-through" : "text-neutral-800"
        }`}
      />
      {/* Always shown on a touch screen; on hover with a mouse. */}
      <button
        type="button"
        onClick={onRemove}
        title="Remove action"
        aria-label="Remove action"
        className="shrink-0 rounded px-1 text-base leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
      >
        ×
      </button>
      {onMakeTask && (
        <button
          type="button"
          onClick={onMakeTask}
          disabled={busy || !!line.madeTaskId}
          title={line.madeTaskId ? "Already a task" : "Make this a task for today"}
          aria-label={line.madeTaskId ? "Already a task" : "Make this a task for today"}
          style={line.madeTaskId ? { color: PROJECT_INK, backgroundColor: PROJECT_FILL } : undefined}
          className={`shrink-0 rounded p-0.5 ${
            line.madeTaskId
              ? "cursor-default"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50"
          }`}
        >
          <ActionTaskIcon />
        </button>
      )}
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="6" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="6" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
    </svg>
  );
}
