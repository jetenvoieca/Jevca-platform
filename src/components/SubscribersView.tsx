"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createMailList,
  deleteMailList,
  duplicateMailList,
  listMailLists,
  listSubscribers,
  renameMailList,
  type MailListSummary,
  type SubscriberRow,
} from "@/lib/actions/subscribers";
import ConfirmDialog from "@/components/ConfirmDialog";
import SubscriberAddModal from "@/components/SubscriberAddModal";
import SubscriberDetailPanel from "@/components/SubscriberDetailPanel";
import SubscriberImportPanel from "@/components/SubscriberImportPanel";
import SubscribeCustomersPanel from "@/components/SubscribeCustomersPanel";

type OpenWindow = "add" | "import" | "customers" | null;
type ListForm = { mode: "add" | "edit"; name: string } | null;

// Marketing → Subscribers (2026-10-08), laid out like the Mail Campaigns
// mockup: the subscribers on the left, with a subscriber's details beside
// them when one is opened; on the right, Add / Edit / Duplicate / Delete
// above the Mail Lists, which act on the selected list. "All subscribers"
// shows everyone and can't be edited.
export default function SubscribersView({
  artistId,
  artistName,
  initialSubscribers,
  initialLists,
}: {
  artistId: string;
  artistName: string;
  initialSubscribers: SubscriberRow[];
  initialLists: MailListSummary[];
}) {
  const [subscribers, setSubscribers] = useState(initialSubscribers);
  const [lists, setLists] = useState(initialLists);
  const [listId, setListId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openWindow, setOpenWindow] = useState<OpenWindow>(null);
  const [listForm, setListForm] = useState<ListForm>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedList = lists.find((l) => l.id === listId) ?? null;
  const opened = subscribers.find((s) => s.id === openId) ?? null;

  const countByList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of subscribers) {
      for (const id of s.listIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [subscribers]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return subscribers.filter((s) => {
      if (listId && !s.listIds.includes(listId)) return false;
      if (!needle) return true;
      const name = [s.firstName, s.lastName].filter(Boolean).join(" ").toLowerCase();
      return name.includes(needle) || s.email.includes(needle);
    });
  }, [subscribers, listId, q]);

  const unsubscribedShown = shown.filter((s) => s.status === "UNSUBSCRIBED").length;
  const listNames = new Map(lists.map((l) => [l.id, l.name]));

  const reload = () => {
    startTransition(async () => {
      const [nextSubscribers, nextLists] = await Promise.all([
        listSubscribers(artistId),
        listMailLists(artistId),
      ]);
      setSubscribers(nextSubscribers);
      setLists(nextLists);
    });
  };

  const replaceSubscriber = (row: SubscriberRow) =>
    setSubscribers((prev) => prev.map((s) => (s.id === row.id ? row : s)));

  // ---- Mail lists ----

  const saveListForm = () => {
    if (!listForm) return;
    setListError(null);
    startTransition(async () => {
      if (listForm.mode === "add") {
        const result = await createMailList(artistId, listForm.name);
        if ("error" in result) {
          setListError(result.error);
          return;
        }
        setLists((prev) => [...prev, result]);
        setListId(result.id);
      } else if (selectedList) {
        const result = await renameMailList(selectedList.id, artistId, listForm.name);
        if ("error" in result) {
          setListError(result.error);
          return;
        }
        const name = listForm.name.trim();
        setLists((prev) => prev.map((l) => (l.id === selectedList.id ? { ...l, name } : l)));
      }
      setListForm(null);
    });
  };

  const handleDuplicate = () => {
    if (!selectedList) return;
    setListError(null);
    startTransition(async () => {
      const result = await duplicateMailList(selectedList.id, artistId);
      if ("error" in result) {
        setListError(result.error);
        return;
      }
      setListId(result.id);
      reload();
    });
  };

  const handleDeleteList = () => {
    if (!selectedList) return;
    const id = selectedList.id;
    setConfirmingDelete(false);
    setListId(null);
    startTransition(async () => {
      await deleteMailList(id, artistId);
      setLists((prev) => prev.filter((l) => l.id !== id));
      setSubscribers((prev) =>
        prev.map((s) => (s.listIds.includes(id) ? { ...s, listIds: s.listIds.filter((x) => x !== id) } : s))
      );
    });
  };

  const buttonClass =
    "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";
  const toolbarButtonClass =
    "rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50";
  const listButtonClass = (active: boolean) =>
    `flex w-full items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
      active
        ? "border-neutral-900 bg-neutral-100 text-neutral-900"
        : "border-transparent text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      {/* ---- Subscribers ---- */}
      <section className="flex min-h-0 gap-4 rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="text-xl text-neutral-900">{selectedList?.name ?? "All subscribers"}</h1>
              <p className="text-xs text-neutral-400">
                {shown.length} subscriber{shown.length === 1 ? "" : "s"}
                {unsubscribedShown > 0 && ` · ${unsubscribedShown} unsubscribed`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setOpenWindow("add")} className={toolbarButtonClass}>
                Add subscriber
              </button>
              <button
                type="button"
                onClick={() => setOpenWindow("import")}
                className={toolbarButtonClass}
              >
                Import CSV
              </button>
              <button
                type="button"
                onClick={() => setOpenWindow("customers")}
                className={toolbarButtonClass}
              >
                Add from Customers
              </button>
            </div>
          </div>

          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="mb-3 w-full max-w-sm rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-400">
                {subscribers.length === 0 ? "No subscribers yet." : "Nobody here."}
              </p>
            ) : (
              <table className="w-full table-fixed text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs text-neutral-400">
                  <tr className="border-b border-neutral-200">
                    <th className="w-[24%] py-2 pr-2 font-normal">Name</th>
                    <th className="w-[34%] py-2 pr-2 font-normal">Email</th>
                    <th className="w-[26%] py-2 pr-2 font-normal">Lists</th>
                    <th className="w-[16%] py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
                    const isOpen = s.id === openId;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setOpenId(isOpen ? null : s.id)}
                        className={`cursor-pointer border-b border-neutral-100 ${
                          isOpen ? "bg-neutral-100" : "hover:bg-neutral-50"
                        }`}
                      >
                        <td className="truncate py-2 pr-2 text-neutral-900">{name || "—"}</td>
                        <td className="truncate py-2 pr-2 text-neutral-600">{s.email}</td>
                        <td className="truncate py-2 pr-2 text-xs text-neutral-500">
                          {s.listIds.map((id) => listNames.get(id)).filter(Boolean).join(", ")}
                        </td>
                        <td
                          className={`py-2 text-xs ${
                            s.status === "UNSUBSCRIBED" ? "text-red-600" : "text-neutral-500"
                          }`}
                        >
                          {s.status === "UNSUBSCRIBED" ? "Unsubscribed" : "Subscribed"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {opened && (
          <div className="w-[320px] shrink-0 border-l border-neutral-200 pl-4">
            <SubscriberDetailPanel
              artistId={artistId}
              subscriber={opened}
              lists={lists}
              onChange={replaceSubscriber}
              onDeleted={(id) => {
                setOpenId(null);
                setSubscribers((prev) => prev.filter((s) => s.id !== id));
              }}
              onClose={() => setOpenId(null)}
            />
          </div>
        )}
      </section>

      {/* ---- Mail lists ---- */}
      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              setListError(null);
              setListForm({ mode: "add", name: "" });
            }}
            disabled={!!listForm || isPending}
            className={buttonClass}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setListError(null);
              if (selectedList) setListForm({ mode: "edit", name: selectedList.name });
            }}
            disabled={!!listForm || !selectedList || isPending}
            className={buttonClass}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={!!listForm || !selectedList || isPending}
            className={buttonClass}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={!!listForm || !selectedList || isPending}
            className={`${buttonClass} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
          >
            Delete
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white p-3">
          <h2 className="mb-3 text-center text-base text-neutral-800">Mail Lists</h2>

          {listForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveListForm();
              }}
              className="mb-3 space-y-2 rounded-md bg-neutral-50 p-2"
            >
              <input
                type="text"
                value={listForm.name}
                onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                placeholder="List name"
                autoFocus
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isPending || !listForm.name.trim()}
                  className="flex-1 rounded-md bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                >
                  {listForm.mode === "add" ? "Add list" : "Save name"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setListForm(null);
                    setListError(null);
                  }}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {listError && <p className="mb-2 text-xs text-red-600">{listError}</p>}

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setListId(null)}
              className={listButtonClass(listId === null)}
            >
              <span className="truncate">All subscribers</span>
              <span className="shrink-0 text-xs text-neutral-400">{subscribers.length}</span>
            </button>
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListId(l.id === listId ? null : l.id)}
                className={listButtonClass(l.id === listId)}
              >
                <span className="truncate">{l.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {countByList.get(l.id) ?? 0}
                </span>
              </button>
            ))}
            {lists.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-400">
                No mail lists yet. Use Add to create one.
              </p>
            )}
          </div>
        </div>
      </aside>

      {openWindow === "add" && (
        <SubscriberAddModal
          artistId={artistId}
          artistName={artistName}
          lists={lists}
          initialListId={listId}
          onAdded={(row) => {
            setSubscribers((prev) => [row, ...prev]);
            setOpenId(row.id);
            setOpenWindow(null);
          }}
          onClose={() => setOpenWindow(null)}
        />
      )}
      {openWindow === "import" && (
        <SubscriberImportPanel
          artistId={artistId}
          artistName={artistName}
          lists={lists}
          initialListId={listId}
          onImported={reload}
          onClose={() => setOpenWindow(null)}
        />
      )}
      {openWindow === "customers" && (
        <SubscribeCustomersPanel
          artistId={artistId}
          artistName={artistName}
          lists={lists}
          initialListId={listId}
          onAdded={reload}
          onClose={() => setOpenWindow(null)}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete && !!selectedList}
        title="Delete this mail list?"
        message={`"${selectedList?.name ?? ""}" will be deleted. Its subscribers stay on file. This can't be undone.`}
        confirmLabel="Delete list"
        danger
        onConfirm={handleDeleteList}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
