"use client";

import { useState, useTransition } from "react";
import WebsiteEditor from "@/components/WebsiteEditor";
import WebsiteHomeView from "@/components/WebsiteHomeView";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  createWebsiteMenuItem,
  deleteWebsiteMenuItem,
  reorderWebsiteMenuItems,
  requestWebsiteImageUploadUrl,
  updateWebsiteHome,
  updateWebsiteMenuItem,
  type WebsiteHomeData,
  type WebsiteMenuItemData,
  type WebsitePageSummary,
} from "@/lib/actions/website";

const inputCls = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";
const labelCls = "mb-1 block text-xs font-medium text-neutral-500";

// Home page editor for the business website (2026-09-29). The preview
// updates as you type; each change saves on its own (text fields on
// leaving the field, everything else straight away) and goes live on
// save — no draft/publish (direct decision). Menu items are reordered by
// dragging their ⋮⋮ handle.
export default function WebsiteHomeEditor({
  pages,
  initialHome,
  initialItems,
}: {
  pages: WebsitePageSummary[];
  initialHome: WebsiteHomeData;
  initialItems: WebsiteMenuItemData[];
}) {
  const [home, setHome] = useState(initialHome);
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const selected = items.find((i) => i.id === selectedId) ?? null;

  function run(task: () => Promise<unknown>) {
    setError(null);
    startSaving(async () => {
      try {
        await task();
      } catch {
        setError("Couldn't save — please try again.");
      }
    });
  }

  // ---- Home fields ----

  function saveHome(next: WebsiteHomeData) {
    run(() => updateWebsiteHome(next));
  }

  async function handleImageFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const result = await requestWebsiteImageUploadUrl(file.name, file.type);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("Upload failed — please try again.");
        return;
      }
      const next = { ...home, imageUrl: result.url };
      setHome(next);
      saveHome(next);
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    const next = { ...home, imageUrl: null };
    setHome(next);
    saveHome(next);
  }

  // ---- Menu items ----

  function patchItem(id: string, patch: Partial<WebsiteMenuItemData>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function saveItem(item: WebsiteMenuItemData | undefined | null) {
    if (!item) return;
    run(() =>
      updateWebsiteMenuItem(item.id, {
        label: item.label,
        text: item.text,
        hoverText: item.hoverText,
        pageId: item.pageId,
      })
    );
  }

  function addItem() {
    run(async () => {
      const item = await createWebsiteMenuItem();
      setItems((prev) => [...prev, item]);
      setSelectedId(item.id);
    });
  }

  function removeSelected() {
    setConfirmRemove(false);
    if (!selected) return;
    const id = selected.id;
    const remaining = items.filter((i) => i.id !== id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    run(() => deleteWebsiteMenuItem(id));
  }

  function dragOver(overId: string) {
    if (!dragId || dragId === overId) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === dragId);
      const to = prev.findIndex((i) => i.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function dragEnd() {
    setDragId(null);
    run(() => reorderWebsiteMenuItems(items.map((i) => i.id)));
  }

  const preview = (
    <div className="h-full bg-white shadow-sm">
      <WebsiteHomeView
        home={home}
        items={items.map((i) => ({
          id: i.id,
          label: i.label,
          text: i.text,
          hoverText: i.hoverText,
          href: null,
        }))}
      />
    </div>
  );

  const fields = (
    <div className="flex flex-col gap-4">
      {/* Image */}
      <div>
        {home.imageUrl ? (
          <div>
            <div className="flex h-44 items-center justify-center rounded-md border border-neutral-300 bg-white p-2">
              <img src={home.imageUrl} alt="" className="h-full w-full object-contain" />
            </div>
            <div className="mt-1 flex gap-3 text-xs">
              <label className="cursor-pointer text-neutral-600 hover:text-neutral-900">
                {uploading ? "Uploading…" : "Replace image"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" onClick={removeImage} className="text-neutral-400 hover:text-red-600">
                Remove image
              </button>
            </div>
          </div>
        ) : (
          <label className="flex h-44 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            {uploading ? "Uploading…" : "+ Image"}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFile(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      {/* Wordmark + email */}
      <div>
        <label className={labelCls}>Wordmark</label>
        <input
          value={home.wordmark}
          onChange={(e) => setHome({ ...home, wordmark: e.target.value })}
          onBlur={() => saveHome(home)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Email</label>
        <input
          value={home.email ?? ""}
          onChange={(e) => setHome({ ...home, email: e.target.value })}
          onBlur={() => saveHome(home)}
          className={inputCls}
        />
      </div>

      {/* Menu items */}
      <div className="rounded-md border border-neutral-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-900">Menu Item</span>
          <button type="button" onClick={addItem} className="text-xs text-neutral-600 hover:text-neutral-900">
            Add
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              onDragOver={(e) => {
                e.preventDefault();
                dragOver(item.id);
              }}
              onDrop={(e) => e.preventDefault()}
              className={`flex items-center gap-2 rounded-md border px-2 ${
                item.id === selectedId ? "border-neutral-400 bg-neutral-100" : "border-neutral-300 bg-white"
              } ${dragId === item.id ? "opacity-50" : ""}`}
            >
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(item.id);
                }}
                onDragEnd={dragEnd}
                title="Drag to reorder"
                className="cursor-grab select-none text-neutral-400"
              >
                ⋮⋮
              </span>
              <input
                value={item.label}
                placeholder="Label"
                onFocus={() => setSelectedId(item.id)}
                onChange={(e) => patchItem(item.id, { label: e.target.value })}
                onBlur={() => saveItem(items.find((i) => i.id === item.id))}
                className="w-full bg-transparent py-2 text-sm outline-none"
              />
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-neutral-400">No menu items yet.</p>}
        </div>

        {selected && (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className={labelCls}>Text</label>
              <input
                value={selected.text}
                onChange={(e) => patchItem(selected.id, { text: e.target.value })}
                onBlur={() => saveItem(selected)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Hover over Text</label>
              <textarea
                value={selected.hoverText}
                rows={6}
                onChange={(e) => patchItem(selected.id, { hoverText: e.target.value })}
                onBlur={() => saveItem(selected)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Go to page</label>
              <select
                value={selected.pageId ?? ""}
                onChange={(e) => {
                  const next = { ...selected, pageId: e.target.value || null };
                  patchItem(selected.id, { pageId: next.pageId });
                  saveItem(next);
                }}
                className={inputCls}
              >
                <option value="">— No page —</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="self-start text-xs text-neutral-400 hover:text-red-600"
            >
              Remove menu item
            </button>
          </div>
        )}
      </div>

      {saving && <p className="text-xs text-neutral-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this menu item?"
        message="It will disappear from the live Home page straight away."
        confirmLabel="Remove"
        danger
        onConfirm={removeSelected}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );

  return <WebsiteEditor pages={pages} selectedId={null} preview={preview} fields={fields} />;
}
