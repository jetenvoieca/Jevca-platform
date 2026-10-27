"use client";

import { useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";

// Dragging one thing onto another within the same component to change
// the order, in a page's Arrange (PageSectionsArranger) — a component's
// pictures (works or Supporting Media) and, since 2026-10-27, its
// Profile stories and Entries: one way of reordering for all of them
// (Craig: standardise, don't duplicate). Each list uses useArrangeItem on
// its items (spread `listeners` on the whole item, or on a handle when
// the item holds typing boxes) and useArrangeReorder to hear a drop.

// What's being dragged, and what it's dropped on.
export type ItemDragData = { type: "item"; blockId: string; itemId: string; url: string | null };
export type ItemDropData = { kind: "item"; blockId: string; itemId: string };

// For one item: its node is both draggable and a drop target. `target`:
// another item of the same component is being dragged over this one.
export function useArrangeItem(
  blockId: string,
  itemId: string,
  url: string | null,
  dragging: { type: string } | null,
) {
  const drag = useDraggable({
    id: `item:${blockId}:${itemId}`,
    data: { type: "item", blockId, itemId, url } satisfies ItemDragData,
  });
  const drop = useDroppable({
    id: `itemdrop:${blockId}:${itemId}`,
    data: { kind: "item", blockId, itemId } satisfies ItemDropData,
  });
  const draggingItem = dragging?.type === "item" ? (dragging as ItemDragData) : null;
  return {
    setNodeRef: (node: HTMLElement | null) => {
      drag.setNodeRef(node);
      drop.setNodeRef(node);
    },
    attributes: drag.attributes,
    listeners: drag.listeners,
    isDragging: drag.isDragging,
    target: !!draggingItem && draggingItem.blockId === blockId && draggingItem.itemId !== itemId && drop.isOver,
  };
}

// The list with the item `fromId` moved to where `toId` is.
export function moveItem<T>(items: T[], idOf: (item: T) => string, fromId: string, toId: string): T[] | null {
  const from = items.findIndex((i) => idOf(i) === fromId);
  const to = items.findIndex((i) => idOf(i) === toId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

// Hears an item of this component dropped onto another of its items
// (within the page's Arrange DndContext) and passes on which moved where.
export function useArrangeReorder(blockId: string, onMove: (fromId: string, toId: string) => void) {
  useDndMonitor({
    onDragEnd: (e) => {
      const from = e.active.data.current as ItemDragData | undefined;
      const to = e.over?.data.current as ItemDropData | undefined;
      if (from?.type !== "item" || to?.kind !== "item") return;
      if (from.blockId !== blockId || to.blockId !== blockId || from.itemId === to.itemId) return;
      onMove(from.itemId, to.itemId);
    },
  });
}
