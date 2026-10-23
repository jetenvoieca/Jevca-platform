import type { CSSProperties } from "react";
import type { LogoByline, LogoHeight } from "@/lib/pageStyleLayout";
import { bodyTextCss } from "@/components/textStyleCss";
import FadeImage from "@/components/FadeImage";

// The artist's Logo on their website (2026-10-22; shared 2026-10-23 by
// the Logo component and a menu's top bar): at its height on a desktop
// or a phone (from 700px — lib/siteBreakpoint.ts — or `device` when
// drawn in a preview frame), never wider than its space, with the words
// typed under it (`bylineText`) tucked in as `byline` sets — their size
// and place all a share of the logo, so they scale with it. `--logo-now`
// is the height in use. Links to `href` when given.
export default function SiteLogo({
  logoUrl,
  bylineText,
  byline,
  height,
  href,
  device,
}: {
  logoUrl: string;
  bylineText: string | null | undefined;
  byline: LogoByline | undefined;
  height: LogoHeight;
  href?: string | null;
  device?: "desktop" | "phone";
}) {
  const words = bylineText ? byline : undefined;
  // The words' height below the logo, kept clear of what follows.
  const below = words ? Math.max(0, words.size - words.up) / 100 : 0;
  const style = {
    "--logo-h": `${height.desktop}px`,
    "--logo-h-phone": `${height.phone}px`,
    ...(device && { "--logo-now": `${height[device]}px` }),
    marginBottom: `calc(var(--logo-now) * ${below})`,
  } as CSSProperties;
  const className = `relative block w-fit max-w-full ${
    device ? "" : "[--logo-now:var(--logo-h-phone)] site:[--logo-now:var(--logo-h)]"
  }`;
  const inside = (
    <>
      <FadeImage src={logoUrl} alt="" className="block h-[var(--logo-now)] w-auto max-w-full object-contain" />
      {words && (
        <span
          className="absolute whitespace-nowrap leading-none"
          style={{
            ...bodyTextCss(words.style),
            fontSize: `calc(var(--logo-now) * ${words.size / 100})`,
            left: `${words.across}%`,
            top: `calc(100% - var(--logo-now) * ${words.up / 100})`,
          }}
        >
          {bylineText}
        </span>
      )}
    </>
  );
  return href ? (
    <a href={href} className={className} style={style}>
      {inside}
    </a>
  ) : (
    <div className={className} style={style}>
      {inside}
    </div>
  );
}
