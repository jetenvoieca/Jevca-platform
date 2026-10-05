"use client";

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

// What's being edited: the Style name, the Style Type ("" until one is
// chosen) and the Private / Custom layout. Held by PageStylesManager so
// its Preview can show every change straight away.
export type PageStyleDraft = {
  name: string;
  type: PageStyleType | "";
  custom: CustomLayout;
  // One-shot, like the old block editor: the next block added sits
  // beside the last row, then this resets.
  placement: "none" | "left" | "right";
};

export const EMPTY_CUSTOM = (emptyLayout("PRIVATE") as Extract<PageStyleLayout, { type: "PRIVATE" }>)
  .layout;

export function draftFrom(name: string, style: PageStyleLayout | null): PageStyleDraft {
  return {
    name,
    type: style?.type ?? "",
    custom: style?.type === "PRIVATE" ? style.layout : EMPTY_CUSTOM,
    placement: "none",
  };
}

// The draft as a layout, or null until a Style Type is chosen.
export function draftLayout(draft: PageStyleDraft): PageStyleLayout | null {
  if (draft.type === "SECTION") return { type: "SECTION", layout: {} };
  if (draft.type === "PRIVATE") return { type: "PRIVATE", layout: draft.custom };
  return null;
}

// Templates → Page Styles' Add / Edit panel (2026-10-04, from Craig's
// mockups): sits in the right-hand column, beside the Preview, and stays
// open until Close. Style name, Style Type, then the chosen type's own
// layout controls — layout only, no content. Private / Custom offers
// the old block editor's controls, adding empty placeholders; Section is
// a fixed layout with no settings yet. Saving is automatic (see
// PageStylesManager); `status` reports it.
export default function PageStyleEditor({
  draft,
  onChange,
  status,
  onClose,
}: {
  draft: PageStyleDraft;
  onChange: (draft: PageStyleDraft) => void;
  status: { text: string; isError: boolean };
  onClose: () => void;
}) {
  const { custom, placement } = draft;
  const setCustom = (next: CustomLayout) => onChange({ ...draft, custom: next });

  const changeType = (value: string) => {
    if (!isPageStyleType(value)) return;
    // A different type has a different layout, so start it afresh.
    onChange({ ...draft, type: value, custom: EMPTY_CUSTOM, placement: "none" });
  };

  const addBlock = (blockType: LayoutBlockType, where: "none" | "left" | "right") =>
    onChange({
      ...draft,
      custom: { ...custom, blocks: addLayoutBlock(custom.blocks, blockType, where) },
      placement: "none",
    });

  const rows = groupBlocksByRow(custom.blocks);
  const smallButton =
    "rounded-md border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50";

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Style name"
          aria-label="Style name"
          autoFocus
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base text-neutral-900"
        />
        <select
          value={draft.type}
          onChange={(e) => changeType(e.target.value)}
          aria-label="Style Type"
          className={`w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-base ${
            draft.type ? "text-neutral-900" : "text-neutral-400"
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

        {draft.type === "SECTION" && (
          <p className="mt-2 text-xs text-neutral-400">
            Section has a fixed layout — a Byline and an artwork grid from the page&apos;s
            curation — with no settings yet.
          </p>
        )}

        {draft.type === "PRIVATE" && (
          <div className="mt-2 flex flex-col gap-2.5">
            <button type="button" onClick={() => addBlock("header", "none")} className={smallButton}>
              + Add Header
            </button>

            {custom.backgroundColor ? (
              <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2">
                <input
                  type="color"
                  value={custom.backgroundColor}
                  onChange={(e) => setCustom({ ...custom, backgroundColor: e.target.value })}
                  aria-label="Background colour"
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border border-neutral-300 p-0"
                />
                <span className="flex-1 text-sm text-neutral-700">{custom.backgroundColor}</span>
                <button
                  type="button"
                  onClick={() => setCustom({ ...custom, backgroundColor: null })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCustom({ ...custom, backgroundColor: "#ffffff" })}
                className={smallButton}
              >
                + Add background colour
              </button>
            )}

            {custom.backgroundImage ? (
              <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 px-2 text-center">
                <span className="text-sm text-neutral-500">Background image — chosen on the page</span>
                <button
                  type="button"
                  onClick={() => setCustom({ ...custom, backgroundImage: false })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCustom({ ...custom, backgroundImage: true })}
                className="flex h-28 items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-sm text-neutral-400 hover:bg-neutral-50"
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
                      className="flex items-center gap-1 rounded-md border border-neutral-200 p-1.5"
                    >
                      <div className="flex min-w-0 flex-1 gap-1">
                        {row.map((b) => (
                          <span
                            key={b.id}
                            className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700"
                          >
                            <span className="truncate">{blockTypeLabel(b.type)}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setCustom({ ...custom, blocks: removeLayoutBlock(custom.blocks, b.id) })
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
                          setCustom({ ...custom, blocks: moveLayoutRow(custom.blocks, i, -1) })
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
                          setCustom({ ...custom, blocks: moveLayoutRow(custom.blocks, i, 1) })
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
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Add block</p>
              <div className="flex gap-1">
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    disabled={custom.blocks.length === 0}
                    onClick={() =>
                      onChange({ ...draft, placement: placement === side ? "none" : side })
                    }
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

      <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-3">
        <p className={`min-w-0 text-xs ${status.isError ? "text-red-600" : "text-neutral-500"}`}>
          {status.text}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
