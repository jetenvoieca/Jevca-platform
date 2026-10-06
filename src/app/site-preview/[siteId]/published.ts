import { cache } from "react";
import { getPublishedSite } from "@/lib/actions/siteSnapshot";

// The published site, read once per request (2026-10-06) — shared by the
// site's layout (its menu) and its page.
export const loadPublishedSite = cache(getPublishedSite);
