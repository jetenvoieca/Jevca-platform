"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CurationWork } from "@/lib/actions/curations";
import { getDynamicPresentation, saveDynamicPresentation } from "@/lib/actions/dynamicPresentations";
import {
  DYNAMIC_LIMITS,
  NEW_SECTION_HEIGHT,
  type DynamicItem,
  type DynamicMedia,
  type DynamicSection,
} from "@/lib/dynamicPresentation";
import { SITE_FONTS } from "@/lib/siteFonts";
import MediaPicker from "@/components/MediaPicker";
import NumberField from "@/components/NumberField";
import { DynamicSectionBox, DynamicWorksContext, type DynamicWork } from "@/components/DynamicSection";

// A curation's Dynamic presentation, edited (2026-11-03, Craig's mockup —
// phase one; see lib/dynamicPresentation.ts): full screen, the controls
// on the left, the sections on the right as they'll look. Click a section
// to choose it — Add Section, its background (colour, picture or video,
// its height), the curation's works, Media Catalogue pictures and text
// are added to it — and drag anything on it to place it (its corner to
// size it); click an item to choose it, then change its words and look
// on the left. Saves itself a moment after each change.

const SAVE_AFTER_MS = 700;
const newId = () => crypto.randomUUID();

export default function DynamicPresentationEditor({
  curationId,
  artistId,
  siteId,
  works,
  onClose,
}: {
  curationId: string;
  artistId: string;
  siteId: string;
  works: CurationWork[];
  onClose: () => void;
}) {
  const [sections, setSections] = useState<DynamicSection[] | null>(null);
  const [media, setMedia] = useState<DynamicMedia>({});
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<DynamicSection[]>([]);

  const workMap = useMemo(
    () => new Map<string, DynamicWork>(works.map((w) => [w.artworkId, { url: w.displayUrl ?? w.imageUrl, name: w.catalogueName }])),
    [works],
  );

  useEffect(() => {
    getDynamicPresentation(curationId, artistId).then((data) => {
      const loaded = data?.presentation.sections ?? [];
      setSections(loaded);
      latest.current = loaded;
      setMedia(data?.media ?? {});
      setSectionId(loaded[0]?.id ?? null);
    });
  }, [curationId, artistId]);

  const save = async () => {
    setStatus("saving");
    const result = await saveDynamicPresentation(curationId, artistId, { sections: latest.current });
    setStatus("error" in result ? "error" : "saved");
  };

  // Saves what's left on closing.
  const close = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await save();
    }
    onClose();
  };

  const change = (next: DynamicSection[]) => {
    setSections(next);
    latest.current = next;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save();
    }, SAVE_AFTER_MS);
  };

  if (!sections) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white text-sm text-neutral-400">Loading…</div>,
      document.body,
    );
  }

  const section = sections.find((s) => s.id === sectionId) ?? null;
  const item = section?.items.find((i) => i.id === itemId) ?? null;

  const setSection = (id: string, patch: Partial<DynamicSection>) =>
    change(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setItem = (sId: string, iId: string, patch: Partial<DynamicItem>) =>
    change(
      sections.map((s) =>
        s.id === sId ? { ...s, items: s.items.map((i) => (i.id === iId ? { ...i, ...patch } : i)) } : s,
      ),
    );
  const addItems = (items: Omit<DynamicItem, "id">[]) => {
    if (!section) return;
    const room = DYNAMIC_LIMITS.items - section.items.length;
    const added = items.slice(0, room).map((i) => ({ ...i, id: newId() }));
    setSection(section.id, { items: [...section.items, ...added] });
    if (added.length === 1) setItemId(added[0].id);
  };
  const base = (n: number): Omit<DynamicItem, "id" | "kind"> => ({
    artworkId: null,
    imageId: null,
    text: "",
    font: "gelasio",
    size: 3,
    colour: "#222222",
    bold: false,
    x: 8 + ((n * 6) % 50),
    y: 8 + ((n * 6) % 50),
    w: 25,
  });

  const addSection = () => {
    if (sections.length >= DYNAMIC_LIMITS.sections) return;
    const next: DynamicSection = { id: newId(), height: NEW_SECTION_HEIGHT, colour: "#ffffff", backgroundImageId: null, items: [] };
    change([...sections, next]);
    setSectionId(next.id);
    setItemId(null);
  };
  const moveSection = (by: -1 | 1) => {
    if (!section) return;
    const i = sections.indexOf(section);
    const next = [...sections];
    next.splice(i, 1);
    next.splice(i + by, 0, section);
    change(next);
  };
  const deleteSection = () => {
    if (!section || !confirm("Delete this section and everything on it?")) return;
    const next = sections.filter((s) => s.id !== section.id);
    change(next);
    setSectionId(next[0]?.id ?? null);
    setItemId(null);
  };
  const deleteItem = () => {
    if (!section || !item) return;
    setSection(section.id, { items: section.items.filter((i) => i.id !== item.id) });
    setItemId(null);
  };
  const toFront = () => {
    if (!section || !item) return;
    setSection(section.id, { items: [...section.items.filter((i) => i.id !== item.id), item] });
  };

  // Dragging an item (or its corner) on its section.
  const startDrag = (e: ReactPointerEvent, s: DynamicSection, i: DynamicItem, resize: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setSectionId(s.id);
    setItemId(i.id);
    const box = (e.currentTarget as HTMLElement).closest("[data-dynamic-section]")?.getBoundingClientRect();
    if (!box) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const from = { x: i.x, y: i.y, w: i.w };
    const l = DYNAMIC_LIMITS;
    const clamp = (v: number, r: { min: number; max: number }) => Math.round(Math.min(r.max, Math.max(r.min, v)) * 10) / 10;
    let current = sections;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / box.width) * 100;
      const dy = ((ev.clientY - startY) / box.height) * 100;
      const patch = resize ? { w: clamp(from.w + dx, l.width) } : { x: clamp(from.x + dx, l.position), y: clamp(from.y + dy, l.position) };
      current = current.map((sec) =>
        sec.id === s.id ? { ...sec, items: sec.items.map((it) => (it.id === i.id ? { ...it, ...patch } : it)) } : sec,
      );
      setSections(current);
      latest.current = current;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      change(current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";
  const button = "w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-40";

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-white">
      <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-neutral-200 p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold text-neutral-900">Dynamic presentation</h2>
          <button type="button" onClick={close} className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">
            Close
          </button>
        </div>
        <p className="-mt-3 text-xs text-neutral-400">
          {status === "saving" ? "Saving…" : status === "error" ? "Couldn't save — try again." : "Saved"}
        </p>

        <button type="button" onClick={addSection} className={button}>
          Add Section
        </button>

        {!section ? (
          <p className="text-sm text-neutral-400">Add a section, or click one to choose it.</p>
        ) : (
          <>
            <div>
              <p className={label}>Section background</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between text-sm text-neutral-700">
                  Colour
                  <input
                    type="color"
                    value={section.colour}
                    onChange={(e) => setSection(section.id, { colour: e.target.value })}
                    className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
                  />
                </label>
                <MediaPicker
                  artistId={artistId}
                  siteId={siteId}
                  mode="single"
                  mediaKinds={["PHOTO", "VIDEO"]}
                  catalogueViews
                  variant="button"
                  label={section.backgroundImageId ? "Change picture or video" : "Picture or short video loop"}
                  onSelect={(images) => {
                    const img = images[0];
                    if (!img) return;
                    setMedia((m) => ({
                      ...m,
                      [img.id]: { kind: img.kind === "VIDEO" ? "VIDEO" : "PHOTO", url: img.url, posterUrl: img.posterUrl },
                    }));
                    setSection(section.id, { backgroundImageId: img.id });
                  }}
                />
                {section.backgroundImageId && (
                  <button type="button" onClick={() => setSection(section.id, { backgroundImageId: null })} className={button}>
                    Remove picture or video
                  </button>
                )}
                <NumberField
                  label="Height"
                  unit="% of its width"
                  step={1}
                  value={section.height}
                  limits={DYNAMIC_LIMITS.height}
                  onCommit={(height) => setSection(section.id, { height })}
                  wide
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveSection(-1)} disabled={sections[0] === section} className={button}>
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(1)}
                    disabled={sections[sections.length - 1] === section}
                    className={button}
                  >
                    ↓ Down
                  </button>
                </div>
                <button type="button" onClick={deleteSection} className={`${button} text-red-600 hover:bg-red-50`}>
                  Delete section
                </button>
              </div>
            </div>

            <div>
              <p className={label}>Works from the curation</p>
              {works.length === 0 ? (
                <p className="text-sm text-neutral-400">The curation has no works yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {works.map((w) => (
                    <button
                      key={w.artworkId}
                      type="button"
                      title={`Add ${w.catalogueName}`}
                      onClick={() => addItems([{ ...base(section.items.length), kind: "work", artworkId: w.artworkId }])}
                      className="aspect-square overflow-hidden rounded bg-neutral-100 hover:opacity-80"
                    >
                      {w.imageUrl && <img src={w.imageUrl} alt="" className="h-full w-full object-cover" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <MediaPicker
                artistId={artistId}
                siteId={siteId}
                mode="multi"
                mediaKinds={["PHOTO", "VIDEO"]}
                catalogueViews
                variant="button"
                label="Add pictures or videos"
                onSelect={(images) => {
                  setMedia((m) => {
                    const next = { ...m };
                    for (const img of images) {
                      next[img.id] = { kind: img.kind === "VIDEO" ? "VIDEO" : "PHOTO", url: img.url, posterUrl: img.posterUrl };
                    }
                    return next;
                  });
                  addItems(images.map((img, n) => ({ ...base(section.items.length + n), kind: "media", imageId: img.id })));
                }}
              />
              <button
                type="button"
                onClick={() => addItems([{ ...base(section.items.length), kind: "text", text: "Text here", w: 40, size: 4 }])}
                className={button}
              >
                Add text
              </button>
            </div>

            {item && (
              <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
                <p className={label}>{item.kind === "text" ? "Text" : "Picture"}</p>
                {item.kind === "text" && (
                  <>
                    <textarea
                      value={item.text}
                      maxLength={DYNAMIC_LIMITS.text}
                      onChange={(e) => setItem(section.id, item.id, { text: e.target.value })}
                      rows={4}
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                    <select
                      value={item.font}
                      onChange={(e) => setItem(section.id, item.id, { font: e.target.value as DynamicItem["font"] })}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      {SITE_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <NumberField
                      label="Size"
                      unit="% of width"
                      step={0.1}
                      value={item.size}
                      limits={DYNAMIC_LIMITS.size}
                      onCommit={(size) => setItem(section.id, item.id, { size })}
                      wide
                    />
                    <label className="flex items-center justify-between text-sm text-neutral-700">
                      Colour
                      <input
                        type="color"
                        value={item.colour}
                        onChange={(e) => setItem(section.id, item.id, { colour: e.target.value })}
                        className="h-7 w-10 cursor-pointer rounded border border-neutral-300 p-0"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" checked={item.bold} onChange={(e) => setItem(section.id, item.id, { bold: e.target.checked })} />
                      Bold
                    </label>
                  </>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={toFront} className={button}>
                    To front
                  </button>
                  <button type="button" onClick={deleteItem} className={`${button} text-red-600 hover:bg-red-50`}>
                    Delete
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-neutral-400">Drag anything to place it; drag its corner to size it.</p>
          </>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-neutral-200 p-6">
        <DynamicWorksContext.Provider value={workMap}>
          <div className="mx-auto flex max-w-[960px] flex-col">
            {sections.length === 0 && (
              <p className="py-20 text-center text-sm text-neutral-500">No sections yet — press Add Section.</p>
            )}
            {sections.map((s) => (
              <div
                key={s.id}
                data-dynamic-section
                onPointerDown={() => {
                  setSectionId(s.id);
                  setItemId(null);
                }}
                className={`relative ${s.id === sectionId ? "z-10 outline outline-2 outline-blue-500" : ""}`}
              >
                <DynamicSectionBox
                  section={s}
                  media={media}
                  renderItem={(it, content, style) => (
                    <div
                      key={it.id}
                      style={style}
                      onPointerDown={(e) => startDrag(e, s, it, false)}
                      className={`cursor-move touch-none ${it.id === itemId ? "outline outline-2 outline-blue-500" : "hover:outline hover:outline-1 hover:outline-blue-300"}`}
                    >
                      {content}
                      {it.id === itemId && (
                        <span
                          onPointerDown={(e) => startDrag(e, s, it, true)}
                          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize border border-white bg-blue-500"
                        />
                      )}
                    </div>
                  )}
                />
              </div>
            ))}
          </div>
        </DynamicWorksContext.Provider>
      </main>
    </div>,
    document.body,
  );
}
