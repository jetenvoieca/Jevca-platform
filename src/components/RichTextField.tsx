"use client";

import { useState, type CSSProperties } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanLinkUrl, cleanRichText, type RichText } from "@/lib/richText";

// A text box for a mail's formatted text (2026-10-08): bold, italic and
// links only (Craig's choice) — every other kind of formatting is
// switched off, and anything pasted in is reduced to plain paragraphs
// with those three. What's typed goes to `onChange` already cleaned (see
// lib/richText.ts). Give it a `key` that changes when it should show a
// different text — it reads `value` only when it first opens. `look`
// (2026-10-10): the font, size and colour the text is shown in, as it
// will be in the mail.
export default function RichTextField({
  label,
  value,
  look,
  onChange,
}: {
  label: string;
  value: RichText;
  look?: CSSProperties;
  onChange: (value: RichText) => void;
}) {
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        underline: false,
        trailingNode: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => onChange(cleanRichText(e.getJSON())),
    editorProps: {
      attributes: {
        "aria-label": label,
        class:
          `min-h-[72px] px-3 py-2 focus:outline-none [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 ${
            look ? "" : "text-sm text-neutral-900"
          }`,
      },
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      link: e?.isActive("link") ?? false,
    }),
  });

  const openLink = () => {
    if (!editor) return;
    setLinkError(false);
    setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? "");
  };

  const applyLink = () => {
    if (!editor || linkDraft === null) return;
    if (!linkDraft.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkDraft(null);
      return;
    }
    const href = cleanLinkUrl(linkDraft);
    if (!href) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkDraft(null);
  };

  const toolButton = (active: boolean) =>
    `rounded px-2 py-0.5 text-xs ${active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`;

  return (
    <div className="rounded-md border border-neutral-300 bg-white">
      <div className="flex items-center gap-1 border-b border-neutral-200 px-1.5 py-1">
        <span className="mr-auto px-1 text-xs text-neutral-500">{label}</span>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`${toolButton(state?.bold ?? false)} font-bold`}
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`${toolButton(state?.italic ?? false)} italic`}
          aria-label="Italic"
        >
          I
        </button>
        <button type="button" onClick={openLink} className={toolButton(state?.link ?? false)}>
          Link
        </button>
      </div>
      {linkDraft !== null && (
        <div className="flex flex-col gap-1 border-b border-neutral-200 p-1.5">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={linkDraft}
              onChange={(e) => {
                setLinkDraft(e.target.value);
                setLinkError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkDraft(null);
              }}
              placeholder="https://… or leave empty to remove"
              aria-label="Link address"
              autoFocus
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setLinkDraft(null)}
              className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
          {linkError && (
            <p className="text-xs text-red-600">That isn&apos;t a web or email address.</p>
          )}
        </div>
      )}
      <div style={look}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
