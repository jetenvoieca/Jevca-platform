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

// A task's action lines (2026-10-20, direct request — see mock-up): each a
// tick box and a line of text, under the description. Open lines come
// first and are put in order by dragging their grip; a ticked line moves
// to the bottom (greyed and crossed out), and goes back to the end of the
// open lines if unticked. Enter adds a line under the one being typed in;
// × removes a line. Empty lines are dropped when the task is saved.
//
// The parent owns the list (it's part of the task form, saved with the
// task); `focusKey` is the line to put the cursor in once it's drawn —
// set by the form's Action button and by Enter here.

export function newActionLine(): TaskActionLine {
  return { key: crypto.randomUUID(), text: "", done: false };
}

// Puts `line` after `afterKey`, or at the end of the open lines.
export function insertActionLine(
  actions: TaskActionLine[],
  line: TaskActionLine,
  afterKey: string | null = null
): TaskActionLine[] {
  const after = afterKey ? actions.findIndex((a) => a.key === afterKey) : -1;
  const at = after >= 0 ? after + 1 : actions.filter((a) => !a.done).length;
  return [...actions.slice(0, at), line, ...actions.slice(at)];
}

export default function TaskActionsList({
  actions,
  focusKey,
  onChange,
  onFocusKey,
}: {
  actions: TaskActionLine[];
  focusKey: string | null;
  onChange: (actions: TaskActionLine[]) => void;
  onFocusKey: (key: string | null) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const open = actions.filter((a) => !a.done);
  const done = actions.filter((a) => a.done);

  if (actions.length === 0) return null;

  const setText = (key: string, text: string) =>
    onChange(actions.map((a) => (a.key === key ? { ...a, text } : a)));

  const toggle = (key: string) => {
    const line = actions.find((a) => a.key === key);
    if (!line) return;
    const rest = actions.filter((a) => a.key !== key);
    const changed = { ...line, done: !line.done };
    onChange(changed.done ? [...rest, changed] : insertActionLine(rest, changed));
  };

  const remove = (key: string) => onChange(actions.filter((a) => a.key !== key));

  const addAfter = (key: string) => {
    const line = newActionLine();
    onChange(insertActionLine(actions, line, key));
    onFocusKey(line.key);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = open.findIndex((a) => a.key === active.id);
    const to = open.findIndex((a) => a.key === over.id);
    if (from < 0 || to < 0) return;
    onChange([...arrayMove(open, from, to), ...done]);
  };

  const rowProps = (a: TaskActionLine) => ({
    line: a,
    focus: focusKey === a.key,
    onFocused: () => onFocusKey(null),
    onText: (text: string) => setText(a.key, text),
    onToggle: () => toggle(a.key),
    onRemove: () => remove(a.key),
    onEnter: () => addAfter(a.key),
  });

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={open.map((a) => a.key)} strategy={verticalListSortingStrategy}>
          {open.map((a) => (
            <SortableActionRow key={a.key} {...rowProps(a)} />
          ))}
        </SortableContext>
      </DndContext>
      {done.map((a) => (
        <ActionRow key={a.key} {...rowProps(a)} />
      ))}
    </div>
  );
}

type RowProps = {
  line: TaskActionLine;
  focus: boolean;
  onFocused: () => void;
  onText: (text: string) => void;
  onToggle: () => void;
  onRemove: () => void;
  onEnter: () => void;
};

// An open line — draggable by its grip.
function SortableActionRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.line.key });
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
  onFocused,
  onText,
  onToggle,
  onRemove,
  onEnter,
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
