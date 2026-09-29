"use client";

import { useState } from "react";
import { websiteSans, websiteSerif } from "@/lib/websiteFonts";

export type WebsiteHomeViewData = {
  imageUrl: string | null;
  wordmark: string;
  email: string | null;
};

export type WebsiteHomeViewItem = {
  id: string;
  label: string;
  text: string;
  hoverText: string;
  // The linked content page's address, or null for no link (always null
  // in the editor's preview, so clicking there doesn't navigate away).
  href: string | null;
};

// The Home page of the business website, jetenvoieca.com (2026-09-29).
// The ONE render of this page — used by the editor's live preview now
// and by the public site later, so the two can never drift apart.
//
// Image on the left, shown whole (object-contain — direct decision) and
// aligned to the top of the sidebar. Beige sidebar on the right:
// wordmark and menu items (label + text) as one block centred in the
// sidebar, email at the bottom. The wordmark's size follows the
// sidebar's width (container query units) so it always fits inside.
// Hovering a menu item reveals its hover text beneath it. Colours
// sampled from the design mockups.
export default function WebsiteHomeView({
  home,
  items,
}: {
  home: WebsiteHomeViewData;
  items: WebsiteHomeViewItem[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={`${websiteSans.className} flex h-full min-h-[560px] flex-col md:flex-row`}>
      <div className="flex h-[55vh] min-h-0 min-w-0 items-start justify-center md:h-auto md:flex-1">
        {home.imageUrl && (
          <img src={home.imageUrl} alt="" className="h-full w-full object-contain object-top" />
        )}
      </div>

      <aside className="relative flex w-full flex-col justify-center bg-[#EEE7CB] px-10 pb-24 pt-16 [container-type:inline-size] md:w-[26%] md:min-w-[300px]">
        <div className="mx-auto w-full max-w-[340px]">
          <h1
            className={`${websiteSerif.className} whitespace-nowrap text-[clamp(24px,12cqw,44px)] font-medium leading-none text-[#555555]`}
          >
            {home.wordmark}
          </h1>

          <ul className="mt-8">
            {items.map((item) => {
              const open = openId === item.id;
              const inner = (
                <>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#AB5C2E]">
                    {item.label}
                  </p>
                  <p className={`${websiteSerif.className} mt-1 text-[22px] leading-snug text-[#191714]`}>
                    {item.text}
                  </p>
                  {item.hoverText && (
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="whitespace-pre-line pt-3 text-[13px] leading-relaxed text-[#888373]">
                          {item.hoverText}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              );
              return (
                <li
                  key={item.id}
                  className="border-t border-[#DDD5B8]"
                  onMouseEnter={() => setOpenId(item.id)}
                  onMouseLeave={() => setOpenId((cur) => (cur === item.id ? null : cur))}
                >
                  {item.href ? (
                    <a href={item.href} className="block py-6">
                      {inner}
                    </a>
                  ) : (
                    <div className="py-6">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {home.email && (
          <a
            href={`mailto:${home.email}`}
            className="absolute bottom-10 right-10 text-[10px] uppercase tracking-[0.2em] text-[#AB5C2E]"
          >
            {home.email}
          </a>
        )}
      </aside>
    </div>
  );
}
