"use client";

import { useEffect, useRef, useState } from "react";
import { MAIL_WIDTH } from "@/lib/mailTemplateLayout";

// Shows a mail's email HTML (2026-10-08) exactly as it will be sent, at
// its real desktop width (a little wider than the mail, so the email's
// own phone layout doesn't kick in), shrunk to fit the panel. The frame
// runs no scripts; links open in a new tab.
const FRAME_WIDTH = MAIL_WIDTH + 40;

export default function MailPreviewFrame({ html }: { html: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const measure = () => setScale(Math.min(1, outer.clientWidth / FRAME_WIDTH));
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    measure();
    return () => observer.disconnect();
  }, []);

  const fitHeight = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) setHeight(doc.documentElement.scrollHeight);
  };

  return (
    <div ref={outerRef} className="w-full" style={{ contain: "inline-size" }}>
      <div className="mx-auto" style={{ width: FRAME_WIDTH * scale, height: height * scale }}>
        <iframe
          ref={frameRef}
          title="Mail preview"
          srcDoc={html}
          onLoad={fitHeight}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{
            width: FRAME_WIDTH,
            height,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        />
      </div>
    </div>
  );
}
