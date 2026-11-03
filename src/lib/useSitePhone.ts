"use client";

import { useEffect, useState } from "react";
import { SITE_PHONE_QUERY } from "@/lib/siteBreakpoint";

// Whether the screen is phone-sized (lib/siteBreakpoint.ts), following
// changes (e.g. turning a tablet). False until measured in the browser.
// Shared (2026-11-03) by the site's menu and the Contact panel.
export function useSitePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(SITE_PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
