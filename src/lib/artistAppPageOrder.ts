// The order of a site's pages in the Artist App's Arrange Pages
// (2026-11-08, Craig's mockup): two lists, Live and Hidden, with pages
// that sit under another page shown indented beneath it (Craig, 8 Nov).
// Plain module so the rules can be read in one place.

export type OrderPage = { id: string; visible: boolean; parentId: string | null };

// The pages as the lists show them, Live then Hidden: in each, a top page
// followed by its own pages in that list. A page whose top page is in
// the other list (or gone) stands alone, where it is.
export function arrangePages<T extends OrderPage>(pages: T[]): T[] {
  const list = (visible: boolean) => {
    const inList = pages.filter((p) => p.visible === visible);
    const ids = new Set(inList.map((p) => p.id));
    return inList.flatMap((p) => {
      if (p.parentId && ids.has(p.parentId)) return [];
      return [p, ...inList.filter((c) => c.parentId === p.id)];
    });
  };
  return [...list(true), ...list(false)];
}

// Where a dragged page is dropped: onto another page (taking its place)
// or onto a list's empty space (its end).
export type PageDrop = { pageId: string } | { visible: boolean };

// The pages after dropping `fromId`, already arranged — or null when the
// drop isn't allowed. A top page moves with its own pages in the same
// list, and can be dropped on another top page (or one of its pages,
// meaning that top page). A page under another moves among the pages
// sharing its top page, or onto that top page to come first; its top
// page stays the same.
export function movePage<T extends OrderPage>(pages: T[], fromId: string, drop: PageDrop): T[] | null {
  const arranged = arrangePages(pages);
  const byId = new Map(arranged.map((p) => [p.id, p]));
  const moving = byId.get(fromId);
  if (!moving) return null;

  const group = moving.parentId
    ? [moving]
    : arranged.filter((p) => p.id === moving.id || (p.parentId === moving.id && p.visible === moving.visible));
  const groupIds = new Set(group.map((p) => p.id));
  const rest = arranged.filter((p) => !groupIds.has(p.id));

  let visible: boolean;
  let index: number;
  if ("visible" in drop) {
    visible = drop.visible;
    const siblings = moving.parentId
      ? rest.filter((p) => p.visible === visible && (p.parentId === moving.parentId || p.id === moving.parentId))
      : [];
    const last = siblings.length ? siblings[siblings.length - 1] : rest.filter((p) => p.visible === visible).pop();
    index = last ? rest.indexOf(last) + 1 : visible ? 0 : rest.length;
  } else {
    let target = byId.get(drop.pageId);
    if (!target || groupIds.has(target.id)) return null;
    visible = target.visible;
    if (moving.parentId) {
      if (target.id === moving.parentId) {
        index = rest.indexOf(target) + 1;
      } else if (target.parentId === moving.parentId) {
        index = rest.indexOf(target) + (movingDown(arranged, moving, target) ? 1 : 0);
      } else return null;
    } else {
      if (target.parentId) target = byId.get(target.parentId) ?? target;
      if (target.parentId || groupIds.has(target.id)) return null;
      // Below a top page means below its own pages too.
      const family = rest.filter((p) => p.id === target!.id || (p.parentId === target!.id && p.visible === target!.visible));
      index = movingDown(arranged, moving, target) ? rest.indexOf(family[family.length - 1]) + 1 : rest.indexOf(target);
    }
  }

  const moved = group.map((p) => ({ ...p, visible }));
  return arrangePages([...rest.slice(0, index), ...moved, ...rest.slice(index)]);
}

// A page dropped on another takes its place: below it when coming down
// within the same list, above it otherwise.
function movingDown<T extends OrderPage>(arranged: T[], moving: T, target: T): boolean {
  return moving.visible === target.visible && arranged.indexOf(moving) < arranged.indexOf(target);
}

// The page whose works show when a page is chosen (Craig, 8 Nov): a page
// with pages under it is a group title with no works of its own, so its
// first page (in the lists' order) opens instead.
export function pageToOpen<T extends OrderPage>(arranged: T[], id: string): string {
  return arranged.find((p) => p.parentId === id)?.id ?? id;
}
