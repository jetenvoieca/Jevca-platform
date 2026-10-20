"use client";

import { useState } from "react";
import { websiteSans, websiteSerif } from "@/lib/websiteFonts";
import WebsiteContactForm from "@/components/WebsiteContactForm";

export type WebsiteHomeViewData = {
  imageUrl: string | null;
  wordmark: string;
  // Where the contact form sends to — never shown; no address = no form.
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
// sidebar, Contact at the bottom. The wordmark's size follows the
// sidebar's width (container query units) so it always fits inside.
// Hovering a menu item reveals its hover text beneath it. Colours
// sampled from the design mockups.
//
// Contact (2026-10-20, direct request — replaces the email address,
// which drew spam): opens the contact form, sliding in over the sidebar's
// menu (WebsiteContactForm). Both sit in the same grid cell, so the
// sidebar is as tall as the taller of the two. `contactSiteKey` is the
// robot check's key on the live site; left out in the editor's preview.
export default function WebsiteHomeView({
  home,
  items,
  contactSiteKey,
}: {
  home: WebsiteHomeViewData;
  items: WebsiteHomeViewItem[];
  contactSiteKey?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div className={`${websiteSans.className} flex h-full min-h-[560px] flex-col md:flex-row`}>
      <div className="flex h-[55vh] min-h-0 min-w-0 items-start justify-center md:h-auto md:flex-1">
        {home.imageUrl && (
          <img src={home.imageUrl} alt="" className="h-full w-full object-contain object-top" />
        )}
      </div>

      <aside className="relative grid w-full items-center overflow-hidden bg-[#EEE7CB] px-10 pb-24 pt-16 [container-type:inline-size] md:w-[26%] md:min-w-[300px]">
        <div
          aria-hidden={contactOpen}
          className={`mx-auto w-full max-w-[340px] transition-all duration-500 ease-out [grid-area:1/1] ${
            contactOpen ? "pointer-events-none -translate-x-8 opacity-0" : ""
          }`}
        >
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
          <>
            <div
              aria-hidden={!contactOpen}
              className={`transition-all duration-500 ease-out [grid-area:1/1] ${
                contactOpen ? "" : "pointer-events-none invisible translate-x-full opacity-0"
              }`}
            >
              <WebsiteContactForm
                siteKey={contactSiteKey}
                active={contactOpen}
                onClose={() => setContactOpen(false)}
              />
            </div>
            {!contactOpen && (
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="absolute bottom-10 right-10 text-[10px] uppercase tracking-[0.2em] text-[#AB5C2E] hover:underline"
              >
                Contact
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
