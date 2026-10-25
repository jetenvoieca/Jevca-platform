"use client";

import { menuPageInset, type MenuStyleLayout } from "@/lib/menuStyleLayout";
import MenuView, { type MenuViewItem } from "@/components/MenuView";

// Example Live Pages for the preview — on a site the menu lists the
// site's own Live Pages, in order.
const EXAMPLE_ITEMS: MenuViewItem[] = [
  { id: "home", title: "Home" },
  {
    id: "works",
    title: "Works",
    children: [
      { id: "paintings", title: "Paintings" },
      { id: "prints", title: "Prints" },
    ],
  },
  { id: "exhibitions", title: "Exhibitions" },
  { id: "about", title: "About" },
  { id: "contact", title: "Contact" },
];

// The Menus page's Preview (2026-10-06): the menu in a desktop frame and
// a phone frame, drawn by the same component as the site (MenuView), on
// a grey example page so opacity and blur show (the logo in a top bar
// and the links under a Side list are stand-ins). Both can be tried —
// the desktop one starts open. `Works` is the current page, with two pages under it. Re-keyed on
// kind, position and behaviour so each change starts from the same
// state.
export default function MenuStylePreview({ layout }: { layout: MenuStyleLayout }) {
  const key = `${layout.kind}-${layout.position}-${layout.behaviour}`;
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <div className="relative aspect-[16/10] w-full max-w-[720px] overflow-hidden rounded-md border border-neutral-300">
          <ExamplePage inset={menuPageInset(layout, "desktop", true)} />
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
          <ExamplePage inset={menuPageInset(layout, "phone", false)} />
          <MenuView key={key} layout={layout} items={EXAMPLE_ITEMS} currentId="works" phone contained />
        </div>
        <figcaption className="text-xs text-neutral-400">Phone — tap the menu</figcaption>
      </figure>
    </div>
  );
}

// Grey blocks standing in for a page's images and text, clear of the
// menu's top bar and Side list as on a site (2026-10-23).
function ExamplePage({ inset }: { inset: { top: number; left: number; right: number } }) {
  return (
    <div className="absolute grid grid-cols-3 gap-2 bg-neutral-100 p-3" style={{ ...inset, bottom: 0 }}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={`rounded ${i % 2 ? "bg-neutral-300" : "bg-neutral-400"}`} />
      ))}
    </div>
  );
}
