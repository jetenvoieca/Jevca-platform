import { Fragment, type ReactNode } from "react";

// Plain text with every web address in it made clickable (2026-10-10 —
// first used by a task's description). Addresses start with http(s):// or
// www.; a full stop, comma or bracket straight after one is left out of
// the link. Links open in a new tab.
const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const TRAILING = /[.,;:!?)\]'"]+$/;

export default function LinkifiedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const url = raw.replace(TRAILING, "");
    parts.push(text.slice(last, start));
    parts.push(
      <a
        key={start}
        href={url.toLowerCase().startsWith("www.") ? `https://${url}` : url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-blue-700 underline [overflow-wrap:anywhere] hover:text-blue-900"
      >
        {url}
      </a>
    );
    last = start + url.length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}
