"use client";

import { useEffect, useState } from "react";
import { updatePageStyle, type PageStyleSummary } from "@/lib/actions/pageStyles";
import type { BlockBuildLayout } from "@/lib/pageStyleLayout";
import { groupBlocksByRow, rowKey, rowSettingsOf } from "@/lib/rowLayout";
import PageStyleLayoutEditor from "@/components/PageStyleLayoutEditor";
import { blockFiller, usePageContent } from "@/components/PagePreview";
import { PresentationProvider } from "@/components/WorkPresentation";
import { useAutoSave } from "@/components/useAutoSave";

// A page's layout, edited on the page itself (2026-10-22, Craig's
// request — "so we can see what we are doing"): its Display Style's
// visual editor (PageStyleLayoutEditor) with each component drawn with
// this page's real pictures and words, instead of grey outlines (an
// empty component still shows its outline). Changes are to the Display
// Style itself, so they reach every page using it, and save themselves
// shortly after (as in Templates → Page Styles). Clicking a component
// selects it — its pictures don't open while editing.
export default function PageLayoutEditor({
  pageId,
  curationId,
  style,
  onClose,
}: {
  pageId: string;
  curationId: string;
  style: Extract<PageStyleSummary, { type: "BLOCK_BUILD" }>;
  onClose: () => void;
}) {
  const { content, loading } = usePageContent(pageId, curationId, true);
  const [layout, setLayout] = useState<BlockBuildLayout>(style.layout);
  const [heroShowing, setHeroShowing] = useState<string | null>(null);
  const autoSave = useAutoSave<BlockBuildLayout>({
    update: (id, next) =>
      updatePageStyle(id, {
        name: style.name,
        type: "BLOCK_BUILD",
        layout: next,
        presentationTemplateId: style.presentationTemplateId,
      }),
    cannotSave: () => null,
    onSaved: () => {},
  });

  // Saves to this page's style; anything still waiting is saved when the
  // editor goes (another page chosen, Edit…).
  useEffect(() => {
    autoSave.begin(style.id);
    return () => {
      void autoSave.flush();
    };
    // Only when first opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (next: BlockBuildLayout) => {
    setLayout(next);
    autoSave.schedule(next);
  };

  const close = async () => {
    await autoSave.flush();
    onClose();
  };

  if (loading || !content?.curation) {
    return <p className="py-10 text-center text-sm text-neutral-400">{loading ? "Loading…" : "No curation."}</p>;
  }

  const fill = blockFiller({
    pageId,
    layout,
    curation: content.curation,
    sections: content.sections,
    components: content.components,
    signupForms: content.signupForms,
    artist: content.artist,
    homeHref: null,
    onOpen: () => {},
    heroShowing,
    onHeroShowing: setHeroShowing,
  });
  const rowAlign = new Map(
    groupBlocksByRow(layout.blocks).flatMap((row) =>
      row.map((b) => [b.id, rowSettingsOf(layout, rowKey(row)).horizontal] as const),
    ),
  );

  return (
    <PresentationProvider settings={style.presentation}>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-neutral-500">
            Layout of <span className="font-medium text-neutral-800">{style.name}</span> — changes apply to every page
            using it. <span className="text-neutral-400">{autoSave.status.text}</span>
          </p>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Done
          </button>
        </div>
        <PageStyleLayoutEditor
          layout={layout}
          onChange={change}
          renderBlock={(b) => {
            const shown = fill(b, rowAlign.get(b.id) ?? "left");
            return shown ? <div className="pointer-events-none">{shown}</div> : null;
          }}
        />
      </div>
    </PresentationProvider>
  );
}
