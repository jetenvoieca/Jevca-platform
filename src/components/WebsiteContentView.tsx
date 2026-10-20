"use client";

import { useState } from "react";
import { websiteSans, websiteSerif } from "@/lib/websiteFonts";

export type WebsiteContentViewPage = {
  title: string;
  caption: string;
  text: string;
};

export type WebsiteNavLink = {
  label: string;
  // null = not clickable (the editor's preview, so clicking there
  // doesn't navigate away).
  href: string | null;
};

// A content page of the business website, jetenvoieca.com (2026-09-29).
// The ONE render of this page — used by the editor's live preview now
// and by the public site later, so the two can never drift apart.
//
// Plain beige page, a simple centred column (small orange title, large
// serif caption, body text, a decorative line), and a hamburger button
// top-right opening a small overlay panel listing Home and every content
// page. Colours sampled from the design mockups.
export default function WebsiteContentView({
  page,
  nav,
}: {
  page: WebsiteContentViewPage;
  nav: WebsiteNavLink[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={`${websiteSans.className} relative min-h-full bg-[#EEE7CB]`}>
      <button
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        onClick={() => setMenuOpen((v) => !v)}
        className="absolute right-8 top-8 z-30 p-1 text-[#1E2749]"
      >
        <svg width="28" height="22" viewBox="0 0 28 22" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M1 2h26M1 11h26M1 20h26" strokeLinecap="round" />
        </svg>
      </button>

      {menuOpen && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <nav className="absolute right-8 top-20 z-20 min-w-[220px] border border-[#DDD5B8] bg-[#F6F1DE] px-7 py-5 shadow-lg">
            <ul>
              {nav.map((link, i) => (
                <li key={i}>
                  {link.href ? (
                    <a
                      href={link.href}
                      className={`${websiteSerif.className} block py-1.5 text-[20px] text-[#191714] hover:text-[#AB5C2E]`}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <span className={`${websiteSerif.className} block py-1.5 text-[20px] text-[#191714]`}>
                      {link.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      <div className="mx-auto w-full max-w-[640px] px-8 pb-24 pt-[22vh]">
        <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-[#AB5C2E]">{page.title}</p>
        <h1 className={`${websiteSerif.className} mt-3 text-[52px] leading-tight text-[#191714]`}>
          {page.caption}
        </h1>
        <p className="mt-8 max-w-[560px] whitespace-pre-line text-[15px] leading-[1.9] text-[#45413A]">
          {page.text}
        </p>
        <div className="mt-28 border-t border-[#DDD5B8]" />
      </div>
    </div>
  );
}
