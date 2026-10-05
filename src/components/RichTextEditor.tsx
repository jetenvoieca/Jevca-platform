"use client";

import { useRef, useState, type MouseEvent } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  RICH_TEXT_CLASS,
  safeLinkHref,
  toRichTextDoc,
  type RichTextDoc,
} from "@/lib/richText";

// Writes formatted text (see lib/richText.ts) — paragraphs, bold, italic
// and links. Fills the box it's placed in; the text scrolls inside it.
// The small toolbar shows only while writing, so at rest only the text
// shows. Bold and italic also work with ⌘B / ⌘I.
//
// Saves when the box is left (like every other field on these pages),
// and only if something changed. `onSave` returns whether it saved; if
// not, the next time the box is left it tries again. Give it a `key` of
// whatever it's editing, so switching to something else starts afresh.
export default function RichTextEditor({
  initialValue,
  onSave,
  label,
}: {
  initialValue: RichTextDoc | null;
  onSave: (doc: RichTextDoc | null) => Promise<boolean>;
  label: string;
}) {
  const [writing, setWriting] = useState(false);
  // The link address being typed, while the link box is open.
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const savedRef = useRef(JSON.stringify(initialValue));

  const editor = useEditor({
    immediatelyRender: false,
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
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => safeLinkHref(url) !== null,
        },
      }),
    ],
    content: initialValue ?? "",
    editorProps: {
      attributes: { class: `min-h-full outline-none ${RICH_TEXT_CLASS}`, "aria-label": label },
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      link: e?.isActive("link") ?? false,
      hasSelection: e ? !e.state.selection.empty : false,
    }),
  });

  const save = async () => {
    if (!editor) return;
    const doc = toRichTextDoc(editor.getJSON());
    const next = JSON.stringify(doc);
    if (next === savedRef.current) return;
    const previous = savedRef.current;
    savedRef.current = next;
    if (!(await onSave(doc))) savedRef.current = previous;
  };

  const openLink = () => {
    if (!editor) return;
    setLinkError(false);
    setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? "");
  };

  const closeLink = () => {
    setLinkDraft(null);
    setLinkError(false);
    editor?.commands.focus();
  };

  const applyLink = () => {
    if (!editor || linkDraft === null) return;
    const href = safeLinkHref(linkDraft);
    if (!href) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkDraft(null);
    setLinkError(false);
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDraft(null);
    setLinkError(false);
  };

  // Keeps the text selected while a toolbar button is pressed.
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const buttonClass = (on: boolean) =>
    `rounded px-2 py-0.5 text-sm ${
      on ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
    } disabled:opacity-30 disabled:hover:bg-transparent`;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onFocus={() => setWriting(true)}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setWriting(false);
        setLinkDraft(null);
        setLinkError(false);
        void save();
      }}
    >
      {/* Toolbar — its space is kept at rest so the text doesn't jump. */}
      <div className={`mb-2 flex h-8 shrink-0 items-center gap-1 ${writing ? "" : "invisible"}`}>
        {linkDraft === null ? (
          <>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold (⌘B)"
              className={`font-bold ${buttonClass(active?.bold ?? false)}`}
            >
              B
            </button>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic (⌘I)"
              className={`italic ${buttonClass(active?.italic ?? false)}`}
            >
              I
            </button>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={openLink}
              disabled={!active?.link && !active?.hasSelection}
              title={active?.link || active?.hasSelection ? "Link" : "Select some text to link it"}
              className={buttonClass(active?.link ?? false)}
            >
              Link
            </button>
          </>
        ) : (
          <>
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
                if (e.key === "Escape") closeLink();
              }}
              autoFocus
              placeholder="example.com"
              className={`min-w-0 flex-1 rounded border px-2 py-0.5 text-sm ${
                linkError ? "border-red-400" : "border-neutral-300"
              }`}
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-neutral-700"
            >
              Apply
            </button>
            {active?.link && (
              <button
                type="button"
                onClick={removeLink}
                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={closeLink}
              className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Clicking anywhere in the box starts writing, not just on the text. */}
      <EditorContent
        editor={editor}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor?.commands.focus("end");
          }
        }}
        className="min-h-0 flex-1 cursor-text overflow-y-auto"
      />
    </div>
  );
}
