"use client";

import { useState } from "react";
import { groupBlocksByRow } from "@/lib/blocks";
import { PAGE_STYLE_TYPES, isPageStyleType, type PageStyleType } from "@/lib/pageStyleTypes";
import {
  LAYOUT_BLOCK_TYPES,
  addLayoutBlock,
  blockTypeLabel,
  emptyLayout,
  moveLayoutRow,
  removeLayoutBlock,
  type CustomLayout,
  type LayoutBlockType,
  type PageStyleLayout,
} from "@/lib/pageStyleLayout";
import type { PageStyleInput } from "@/lib/actions/pageStyles";

const EMPTY_CUSTOM = (emptyLayout("PRIVATE") as Extract<PageStyleLayout, { type: "PRIVATE" }>)
  .layout;

// Templates → Page Styles' Add / Edit modal (2026-10-04, from Craig's
// mockup): Style name, Style Type, and then the chosen type's own layout
// controls. Layout only — no content is added here. Private / Custom
// offers the old block editor's controls, adding empty placeholders;
// Section is a fixed layout with no settings yet.
export default function PageStyleModal({
  heading,
  initialName,
  initialStyle,
  saving,
  error,
  onSave,
  onCancel,
}: {
  heading: string;
  initialName: string;
  initialStyle: PageStyleLayout | null;
  saving: boolean;
  error: string | null;
  onSave: (input: PageStyleInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<PageStyleType | "">(initialStyle?.type ?? "");
  const [custom, setCustom] = useState<CustomLayout>(
    initialStyle?.type === "PRIVATE" ? initialStyle.layout : EMPTY_CUSTOM
  );
  // One-shot, like the old block editor: the next block added sits
  // beside the last row, then this resets.
  const [placement, setPlacement] = useState<"none" | "left" | "right">("none");

  const changeType = (value: string) => {
    if (!isPageStyleType(value)) return;
    setType(value);
    // A different type has a different layout, so start it afresh.
    setCustom(EMPTY_CUSTOM);
    setPlacement("none");
  };

  const addBlock = (blockType: LayoutBlockType, where: "none" | "left" | "right") => {
    setCustom((c) => ({ ...c, blocks: addLayoutBlock(c.blocks, blockType, where) }));
    setPlacement("none");
  };

  const rows = groupBlocksByRow(custom.blocks);
  const smallButton =
    "rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <form
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, type, layout: type === "PRIVATE" ? custom : {} });
        }}
      >
        <h3 className="sr-only">{heading}</h3>

        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Style name"
            aria-label="Style name"
            autoFocus
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
          />
          <select
            value={type}
            onChange={(e) => changeType(e.target.value)}
            aria-label="Style Type"
            className={`w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base ${
              type ? "text-neutral-900" : "text-neutral-400"
            }`}
          >
            <option value="" disabled>
              Style Type
            </option>
            {PAGE_STYLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {type === "SECTION" && (
            <div className="mt-3 flex flex-col gap-3">
              <Placeholder label="Byline" className="h-12" />
              <Placeholder label="Artwork grid — filled from the page's curation" className="h-40" />
              <p className="text-xs text-neutral-400">
                Section has a fixed layout, with no settings yet.
              </p>
            </div>
          )}

          {type === "PRIVATE" && (
            <div className="mt-3 flex flex-col gap-3">
              <button type="button" onClick={() => addBlock("header", "none")} className={smallButton}>
                + Add Header
              </button>

              {custom.backgroundColor ? (
                <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
                  <input
                    type="color"
                    value={custom.backgroundColor}
                    onChange={(e) => setCustom((c) => ({ ...c, backgroundColor: e.target.value }))}
                    aria-label="Background colour"
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
                  />
                  <span className="flex-1 text-sm text-neutral-700">{custom.backgroundColor}</span>
                  <button
                    type="button"
                    onClick={() => setCustom((c) => ({ ...c, backgroundColor: null }))}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustom((c) => ({ ...c, backgroundColor: "#ffffff" }))}
                  className={smallButton}
                >
                  + Add background colour
                </button>
              )}

              {custom.backgroundImage ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50">
                  <span className="text-sm text-neutral-500">Background image — chosen on the page</span>
                  <button
                    type="button"
                    onClick={() => setCustom((c) => ({ ...c, backgroundImage: false }))}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustom((c) => ({ ...c, backgroundImage: true }))}
                  className="flex h-40 items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:bg-neutral-50"
                >
                  + Add background Image
                </button>
              )}

              {rows.length > 0 && (
                <div className="mt-2">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Layout
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row, i) => (
                      <div
                        key={row[0].id}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-200 p-1.5"
                      >
                        <div className="flex flex-1 gap-1.5">
                          {row.map((b) => (
                            <span
                              key={b.id}
                              className="flex flex-1 items-center justify-between gap-1 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700"
                            >
                              {blockTypeLabel(b.type)}
                              <button
                                type="button"
                                onClick={() =>
                                  setCustom((c) => ({ ...c, blocks: removeLayoutBlock(c.blocks, b.id) }))
                                }
                                aria-label={`Remove ${blockTypeLabel(b.type)}`}
                                className="text-neutral-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCustom((c) => ({ ...c, blocks: moveLayoutRow(c.blocks, i, -1) }))
                          }
                          disabled={i === 0}
                          aria-label="Move up"
                          className="px-1 text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustom((c) => ({ ...c, blocks: moveLayoutRow(c.blocks, i, 1) }))
                          }
                          disabled={i === rows.length - 1}
                          aria-label="Move down"
                          className="px-1 text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Add block
                </p>
                <div className="flex gap-1">
                  {(["left", "right"] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      disabled={custom.blocks.length === 0}
                      onClick={() => setPlacement((p) => (p === side ? "none" : side))}
                      className={`rounded-md border px-2 py-1 text-xs disabled:opacity-30 ${
                        placement === side
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      {side === "left" ? "To left" : "To Right"}
                    </button>
                  ))}
                </div>
              </div>
              {placement !== "none" && (
                <p className="text-xs text-amber-600">
                  The next block sits to the {placement} of the last row.
                </p>
              )}
              {LAYOUT_BLOCK_TYPES.filter((t) => t.value !== "header").map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => addBlock(t.value, placement)}
                  className={smallButton}
                >
                  + {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 p-4">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !type}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Placeholder({ label, className }: { label: string; className: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 px-3 text-center text-sm text-neutral-500 ${className}`}
    >
      {label}
    </div>
  );
}
