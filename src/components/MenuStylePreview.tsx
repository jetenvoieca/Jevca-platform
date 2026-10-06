"use client";

import type { MenuStyleLayout } from "@/lib/menuStyleLayout";
import MenuView, { type MenuViewItem } from "@/components/MenuView";

// Example Live Pages for the preview — on a site the menu lists the
// site's own Live Pages, in order.
const EXAMPLE_ITEMS: MenuViewItem[] = [
  { id: "home", title: "Home" },
  { id: "works", title: "Works" },
  { id: "exhibitions", title: "Exhibitions" },
  { id: "about", title: "About" },
  { id: "contact", title: "Contact" },
];

// The Menus page's Preview (2026-10-06): the menu in a desktop frame and
// a phone frame, drawn by the same component as the site (MenuView), on
// a grey example page so opacity and blur show. Both can be tried — the
// desktop one starts open. `Works` is the current page. Re-keyed on
// kind, position and behaviour so each change starts from the same
// state.
export default function MenuStylePreview({ layout }: { layout: MenuStyleLayout }) {
  const key = `${layout.kind}-${layout.position}-${layout.behaviour}`;
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <div className="relative aspect-[16/10] w-full max-w-[720px] overflow-hidden rounded-md border border-neutral-300">
          <ExamplePage />
          <MenuView
            key={key}
            layout={layout}
            items={EXAMPLE_ITEMS}
            currentId="works"
            phone={false}
            contained
            defaultOpen
          />
        </div>
        <figcaption className="text-xs text-neutral-400">Desktop</figcaption>
      </figure>
      <figure className="flex flex-col items-center gap-2">
        <div className="relative h-[440px] w-[220px] overflow-hidden rounded-[24px] border-4 border-neutral-800">
          <ExamplePage />
          <MenuView
            key={key}
            layout={layout}
            items={EXAMPLE_ITEMS}
            currentId="works"
            phone
            contained
          />
        </div>
        <figcaption className="text-xs text-neutral-400">Phone — tap the menu</figcaption>
      </figure>
    </div>
  );
}

// Grey blocks standing in for a page's images and text.
function ExamplePage() {
  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-2 bg-neutral-100 p-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={`rounded ${i % 2 ? "bg-neutral-300" : "bg-neutral-400"}`} />
      ))}
    </div>
  );
}
