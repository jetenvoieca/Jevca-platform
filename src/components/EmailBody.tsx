"use client";

// An email's body as the Inbox shows it (moved out of AdminInboxPanel on
// 2026-10-09, so the Personal tab's Gmail shows email exactly the same
// way): the sender's original HTML by default, or its plain text when
// `showText` is set or there's no HTML.

// "1.2 MB" / "340 KB" — attachment sizes in an open email.
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Fits an email's original HTML to the width of its frame (2026-09-24).
// Most HTML email is laid out at a fixed width (often 600px+), wider than
// the modal, which used to leave it scrolling sideways. Once the frame has
// loaded, the content is scaled down to fit if it's wider than the frame,
// and the frame is resized to the content's full height so the modal has
// one scroll bar, not two. This reads the frame's document, which is why
// the frame is sandboxed with allow-same-origin — still with no
// allow-scripts, so nothing in the email itself can ever run.
function fitHtmlFrame(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc?.body) return;
  const root = doc.documentElement;
  const contentWidth = root.scrollWidth;
  const contentHeight = root.scrollHeight;
  const scale = contentWidth > frame.clientWidth ? frame.clientWidth / contentWidth : 1;
  root.style.overflow = "hidden";
  if (scale < 1) {
    doc.body.style.transformOrigin = "0 0";
    doc.body.style.transform = `scale(${scale})`;
  }
  frame.style.height = `${Math.ceil(contentHeight * scale) + 2}px`;
}

export default function EmailBody({
  htmlBody,
  textBody,
  showText,
}: {
  htmlBody: string | null;
  textBody: string;
  showText: boolean;
}) {
  if (htmlBody && !showText) {
    // The sender's original formatting (2026-09-24), shown by default since
    // 2026-09-28. No allow-scripts, so nothing in the email can run
    // (allow-same-origin only lets fitHtmlFrame measure and fit it); <base
    // target="_blank"> makes its links open in a new tab rather than inside
    // the frame. Its images do load from the sender's server, as in any
    // mail app.
    return (
      <iframe
        title="Original email"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={`<base target="_blank">${htmlBody}`}
        onLoad={(e) => fitHtmlFrame(e.currentTarget)}
        className="h-[60vh] w-full bg-white"
      />
    );
  }
  // Long unbroken text (tracking links, mostly) wraps instead of pushing
  // the modal sideways.
  return <p className="whitespace-pre-wrap text-sm text-neutral-700 [overflow-wrap:anywhere]">{textBody}</p>;
}
