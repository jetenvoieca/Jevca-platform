"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  renameMenu,
  addGroup,
  updateGroupName,
  deleteGroup,
  moveGroup,
  addMenuItem,
  updateMenuItem,
  removeMenuItem,
  moveMenuItem,
} from "@/lib/actions/menus";

type Item = {
  id: string;
  label: string;
  byline: string | null;
  page: { id: string; title: string };
};
type Group = { id: string; name: string; items: Item[] };
type MenuData = { id: string; siteId: string; name: string; isActive: boolean; groups: Group[] };
type SitePage = { id: string; title: string };

export default function MenuBuilder({
  siteId,
  menu,
  sitePages,
}: {
  siteId: string;
  menu: MenuData;
  sitePages: SitePage[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="p-6">
      <Link
        href={`/sites/${siteId}/menus`}
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← All Menus
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <input
          type="text"
          defaultValue={menu.name}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (!value || value === menu.name) return;
            const fd = new FormData();
            fd.set("name", value);
            startTransition(() => renameMenu(menu.id, fd));
          }}
          className="rounded-md border border-transparent px-2 py-1 text-2xl font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-300"
        />
        {menu.isActive && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Active
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          const fd = new FormData();
          fd.set("name", "New Group");
          startTransition(() => addGroup(menu.id, fd));
        }}
        className="mb-6 rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        + Add Group
      </button>

      <div className="flex flex-col gap-6">
        {menu.groups.map((group, gi) => (
          <div key={group.id} className="rounded-lg border border-neutral-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <input
                type="text"
                defaultValue={group.name}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (!value || value === group.name) return;
                  const fd = new FormData();
                  fd.set("name", value);
                  startTransition(() => updateGroupName(group.id, fd));
                }}
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-lg font-medium"
              />
              <button
                type="button"
                disabled={gi === 0}
                onClick={() => startTransition(() => moveGroup(group.id, -1))}
                className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={gi === menu.groups.length - 1}
                onClick={() => startTransition(() => moveGroup(group.id, 1))}
                className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Delete group "${group.name}" and all its items?`)) return;
                  startTransition(() => deleteGroup(group.id));
                }}
                className="text-sm text-red-500 hover:underline"
              >
                Remove Group
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {group.items.map((item, ii) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  isFirst={ii === 0}
                  isLast={ii === group.items.length - 1}
                />
              ))}
            </div>

            <div className="mt-3">
              <select
                defaultValue=""
                onChange={(e) => {
                  const pageId = e.target.value;
                  if (!pageId) return;
                  startTransition(() => addMenuItem(group.id, pageId));
                  e.target.value = "";
                }}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600"
              >
                <option value="">+ Add Item (choose a page)…</option>
                {sitePages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {menu.groups.length === 0 && (
        <p className="text-sm text-neutral-500">No groups yet — click + Add Group to start.</p>
      )}
    </div>
  );
}

function MenuItemRow({
  item,
  isFirst,
  isLast,
}: {
  item: Item;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [label, setLabel] = useState(item.label);
  const [byline, setByline] = useState(item.byline || "");
  const [isPending, startTransition] = useTransition();

  const save = () => {
    const fd = new FormData();
    fd.set("label", label);
    fd.set("byline", byline);
    startTransition(() => updateMenuItem(item.id, fd));
  };

  return (
    <div className="flex items-start gap-2 rounded-md border border-neutral-200 p-2">
      <div className="flex-1">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={save}
          className="mb-1 w-full rounded border border-transparent px-2 py-1 text-sm font-medium hover:border-neutral-300 focus:border-neutral-300"
        />
        <input
          type="text"
          value={byline}
          onChange={(e) => setByline(e.target.value)}
          onBlur={save}
          placeholder="Byline (optional)"
          className="w-full rounded border border-transparent px-2 py-1 text-sm italic text-neutral-500 hover:border-neutral-300 focus:border-neutral-300"
        />
        <p className="px-2 text-xs text-neutral-400">Page: {item.page.title}</p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => startTransition(() => moveMenuItem(item.id, -1))}
          className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => startTransition(() => moveMenuItem(item.id, 1))}
          className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => removeMenuItem(item.id))}
        className="px-1 text-neutral-400 hover:text-red-600"
      >
        ✕
      </button>
    </div>
  );
}
