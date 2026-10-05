import type { ReactNode } from "react";
import { RICH_TEXT_CLASS, type RichTextDoc, type RichTextInline } from "@/lib/richText";

// Shows formatted text (see lib/richText.ts) as ordinary page elements —
// never as raw HTML. Links open in a new tab.
export default function RichTextView({
  doc,
  className = "",
}: {
  doc: RichTextDoc;
  className?: string;
}) {
  return (
    <div className={`${RICH_TEXT_CLASS} ${className}`}>
      {doc.content.map((paragraph, i) => (
        <p key={i}>
          {paragraph.content && paragraph.content.length > 0 ? (
            paragraph.content.map((node, j) => <Inline key={j} node={node} />)
          ) : (
            <br />
          )}
        </p>
      ))}
    </div>
  );
}

function Inline({ node }: { node: RichTextInline }) {
  if (node.type === "hardBreak") return <br />;
  let out: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = <strong>{out}</strong>;
    else if (mark.type === "italic") out = <em>{out}</em>;
    else if (mark.type === "link") {
      out = (
        <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
          {out}
        </a>
      );
    }
  }
  return <>{out}</>;
}
