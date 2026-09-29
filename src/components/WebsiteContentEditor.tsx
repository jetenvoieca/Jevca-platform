"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import WebsiteEditor from "@/components/WebsiteEditor";
import WebsiteContentView from "@/components/WebsiteContentView";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  deleteWebsitePage,
  updateWebsitePage,
  type WebsitePageData,
  type WebsitePageSummary,
} from "@/lib/actions/website";

const inputCls = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";
const labelCls = "mb-1 block text-xs font-medium text-neutral-500";

// Content page editor for the business website (2026-09-29). The
// preview updates as you type; text fields save on leaving the field
// and go live on save — no draft/publish (direct decision).
export default function WebsiteContentEditor({
  pages,
  initialPage,
}: {
  pages: WebsitePageSummary[];
  initialPage: WebsitePageData;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const res = await updateWebsitePage(page.id, {
          name: page.name,
          slug: page.slug,
          title: page.title,
          caption: page.caption,
          text: page.text,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        setPage((p) => ({ ...p, slug: res.slug }));
        // Updates the page dropdown if the name changed.
        router.refresh();
      } catch {
        setError("Couldn't save — please try again.");
      }
    });
  }

  function handleDelete() {
    setConfirmDelete(false);
    startSaving(async () => {
      await deleteWebsitePage(page.id);
      router.push("/accounts/website");
    });
  }

  const set = (patch: Partial<WebsitePageData>) => setPage((p) => ({ ...p, ...patch }));

  const preview = (
    <div className="h-full shadow-sm">
      <WebsiteContentView
        page={page}
        nav={[
          { label: "Home", href: null },
          ...pages.map((p) => ({ label: p.id === page.id ? page.name : p.name, href: null })),
        ]}
      />
    </div>
  );

  const fields = (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelCls}>Page name</label>
        <input
          value={page.name}
          onChange={(e) => set({ name: e.target.value })}
          onBlur={save}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Web address</label>
        <div className="flex items-center rounded-md border border-neutral-300 bg-white text-sm">
          <span className="pl-3 text-neutral-400">jetenvoieca.com/</span>
          <input
            value={page.slug}
            onChange={(e) => set({ slug: e.target.value })}
            onBlur={save}
            className="w-full bg-transparent py-2 pr-3 outline-none"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Title</label>
        <input
          value={page.title}
          onChange={(e) => set({ title: e.target.value })}
          onBlur={save}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Caption</label>
        <textarea
          value={page.caption}
          rows={2}
          onChange={(e) => set({ caption: e.target.value })}
          onBlur={save}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Text</label>
        <textarea
          value={page.text}
          rows={12}
          onChange={(e) => set({ text: e.target.value })}
          onBlur={save}
          className={inputCls}
        />
      </div>

      {saving && <p className="text-xs text-neutral-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="w-full rounded-md border border-neutral-300 bg-white py-2 text-sm text-neutral-700 hover:border-red-300 hover:text-red-600"
      >
        Delete page
      </button>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this page?"
        message="It will disappear from the live website straight away. Any Home menu item linking to it will lose its link."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );

  return <WebsiteEditor pages={pages} selectedId={page.id} preview={preview} fields={fields} />;
}
