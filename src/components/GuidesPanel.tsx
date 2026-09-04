"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGuide,
  updateGuide,
  deleteGuide,
  requestGuideImageUploadUrl,
  type GuideWithSteps,
  type GuideStep,
  type GuideCategory,
} from "@/lib/actions/guides";
import ConfirmDialog from "@/components/ConfirmDialog";

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
const buttonCls =
  "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50";

function newStepId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// The Guides admin page (2026-09-04, direct request) — a topic list per
// category (User / Technical pill tabs), each topic expanding in place
// into an edit panel (title + an ordered list of steps, each with text
// and an optional image) rather than a separate modal, matching the
// reference mockup's own two-screen flow but as one expanding card.
//
// Every field change here saves immediately (title on blur, steps on
// every add/remove/reorder/image change) — same "no explicit Save
// button" convention already used throughout Settings elsewhere in this
// app — rather than a Save/Cancel pair. Up/down arrows do step
// reordering instead of real drag-and-drop: this app has no
// drag-and-drop library, and a handful of steps per guide doesn't
// justify adding one.
export default function GuidesPanel({ guides }: { guides: GuideWithSteps[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<GuideCategory>("USER");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSteps, setEditSteps] = useState<GuideStep[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);

  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const visible = guides.filter((g) => g.category === tab);

  const startEdit = (guide: GuideWithSteps) => {
    setEditingId(guide.id);
    setEditTitle(guide.title);
    setEditSteps(guide.steps.map((s) => ({ ...s })));
    setSaveError(null);
  };

  const closeEdit = () => {
    setEditingId(null);
    setSaveError(null);
  };

  // Persists whatever title/steps are passed in — called after every
  // discrete change (a blur, an add, a remove, a reorder, an image
  // finishing upload) rather than from one big "Save" button.
  const persist = (title: string, steps: GuideStep[]) => {
    if (!editingId) return;
    startTransition(async () => {
      const res = await updateGuide(editingId, title, steps);
      if ("error" in res) {
        setSaveError(res.error);
        return;
      }
      setSaveError(null);
      router.refresh();
    });
  };

  const handleDeleteClick = (id: string) => setPendingDeleteId(id);

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    startTransition(async () => {
      await deleteGuide(id);
      if (editingId === id) closeEdit();
      router.refresh();
    });
  };

  const handleCreateTopic = () => {
    const title = newTopicTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const res = await createGuide(tab, title);
      if ("error" in res) {
        alert(res.error);
        return;
      }
      setNewTopicOpen(false);
      setNewTopicTitle("");
      router.refresh();
      startEdit(res.guide);
    });
  };

  const addStep = () => {
    const next = [...editSteps, { id: newStepId(), text: "", imageUrl: null }];
    setEditSteps(next);
    persist(editTitle, next);
  };

  const removeStep = (id: string) => {
    const next = editSteps.filter((s) => s.id !== id);
    setEditSteps(next);
    persist(editTitle, next);
  };

  const moveStep = (id: string, direction: -1 | 1) => {
    const idx = editSteps.findIndex((s) => s.id === id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= editSteps.length) return;
    const next = [...editSteps];
    [next[idx], next[target]] = [next[target], next[idx]];
    setEditSteps(next);
    persist(editTitle, next);
  };

  const handleStepImageUpload = async (stepId: string, file: File) => {
    setUploadingStepId(stepId);
    try {
      const result = await requestGuideImageUploadUrl(file.name, file.type);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        alert("Upload failed — please try again.");
        return;
      }
      const next = editSteps.map((s) => (s.id === stepId ? { ...s, imageUrl: result.url } : s));
      setEditSteps(next);
      persist(editTitle, next);
    } finally {
      setUploadingStepId(null);
    }
  };

  const removeStepImage = (stepId: string) => {
    const next = editSteps.map((s) => (s.id === stepId ? { ...s, imageUrl: null } : s));
    setEditSteps(next);
    persist(editTitle, next);
  };

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full border border-neutral-300 bg-white p-1">
        {(["USER", "TECHNICAL"] as GuideCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setTab(cat);
              closeEdit();
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === cat ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {cat === "USER" ? "User" : "Technical"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((guide) =>
          editingId === guide.id ? (
            <div key={guide.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => persist(editTitle, editSteps)}
                  placeholder="Guide title"
                  className={`${inputCls} bg-white`}
                />
                <div className="flex shrink-0 gap-2">
                  <a href={`/api/guide/${guide.id}`} className={buttonCls}>
                    PDF
                  </a>
                  <button type="button" onClick={closeEdit} className={buttonCls}>
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(guide.id)}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {saveError && <p className="mb-3 text-xs text-red-600">{saveError}</p>}
              {isPending && <p className="mb-3 text-xs text-neutral-400">Saving…</p>}

              <div className="flex flex-col gap-3">
                {editSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="flex gap-2 rounded-md border border-neutral-200 bg-white p-2"
                  >
                    <div className="flex flex-col items-center justify-center gap-1 pt-1 text-neutral-400">
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, -1)}
                        disabled={idx === 0}
                        className="hover:text-neutral-700 disabled:opacity-30"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 1)}
                        disabled={idx === editSteps.length - 1}
                        className="hover:text-neutral-700 disabled:opacity-30"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex-1">
                      <textarea
                        value={step.text}
                        onChange={(e) =>
                          setEditSteps((prev) =>
                            prev.map((s) => (s.id === step.id ? { ...s, text: e.target.value } : s))
                          )
                        }
                        onBlur={() => persist(editTitle, editSteps)}
                        rows={2}
                        placeholder={`Step ${idx + 1}`}
                        className={inputCls}
                      />
                      <div className="mt-2">
                        {step.imageUrl ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={step.imageUrl}
                              alt=""
                              className="h-12 w-12 rounded border border-neutral-200 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeStepImage(step.id)}
                              className="text-xs text-neutral-400 hover:text-red-600"
                            >
                              Remove image
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                            {uploadingStepId === step.id ? "Uploading…" : "+ Image"}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingStepId === step.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleStepImageUpload(step.id, file);
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      className="self-start text-neutral-400 hover:text-red-600"
                      title="Remove step"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addStep}
                className="mt-3 w-full rounded-md border border-dashed border-neutral-300 bg-white py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
              >
                + Add step
              </button>
            </div>
          ) : (
            <div
              key={guide.id}
              className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3"
            >
              <span className="text-sm text-neutral-900">{guide.title}</span>
              <div className="flex shrink-0 gap-2">
                <a href={`/api/guide/${guide.id}`} className={buttonCls}>
                  PDF
                </a>
                <button type="button" onClick={() => startEdit(guide)} className={buttonCls}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteClick(guide.id)}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {visible.length === 0 && (
          <p className="px-1 py-2 text-sm text-neutral-400">No guides in this category yet.</p>
        )}

        {newTopicOpen ? (
          <div className="flex gap-2 rounded-lg border border-neutral-200 bg-white p-2">
            <input
              autoFocus
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateTopic();
                if (e.key === "Escape") {
                  setNewTopicOpen(false);
                  setNewTopicTitle("");
                }
              }}
              placeholder="Guide title"
              className={inputCls}
            />
            <button
              type="button"
              onClick={handleCreateTopic}
              disabled={isPending}
              className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setNewTopicOpen(false);
                setNewTopicTitle("");
              }}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewTopicOpen(true)}
            className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm text-neutral-500 hover:bg-neutral-50"
          >
            + New Topic
          </button>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this guide?"
        message="This removes the guide and all its steps permanently — it cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
