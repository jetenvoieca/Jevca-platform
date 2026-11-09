"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteFeatures } from "@/lib/plans";

// What the site's Plan and add-ons give it in the Artist App (2026-11-09
// — see siteFeatures in lib/plans.ts), set once by the app's layout for
// all its screens.
const ArtistAppFeaturesContext = createContext<SiteFeatures | null>(null);

export default function ArtistAppFeaturesProvider({
  features,
  children,
}: {
  features: SiteFeatures;
  children: ReactNode;
}) {
  return <ArtistAppFeaturesContext.Provider value={features}>{children}</ArtistAppFeaturesContext.Provider>;
}

// Fails loudly rather than guessing what the site has if a screen is ever
// shown outside the app's layout.
export function useArtistAppFeatures(): SiteFeatures {
  const features = useContext(ArtistAppFeaturesContext);
  if (!features) throw new Error("useArtistAppFeatures must be used inside the Artist App.");
  return features;
}
