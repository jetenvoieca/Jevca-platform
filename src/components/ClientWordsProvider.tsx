"use client";

import { createContext, useContext, type ReactNode } from "react";
import { clientWords, type ClientKind, type ClientWords } from "@/lib/clientKind";

// The wording for the client whose screens are showing (2026-10-09) —
// Artwork / Product, Gallery / Store… (lib/clientKind.ts). Set once by the
// site layout (and the preview layout) for everything inside a site, and
// by SaleModal for the sale it shows, since that window also opens from
// lists that cover every client.
const ClientWordsContext = createContext<ClientWords | null>(null);

export default function ClientWordsProvider({
  kind,
  children,
}: {
  kind: ClientKind;
  children: ReactNode;
}) {
  return (
    <ClientWordsContext.Provider value={clientWords(kind)}>{children}</ClientWordsContext.Provider>
  );
}

// Fails loudly rather than guessing a client type if a screen is ever
// shown outside a provider.
export function useClientWords(): ClientWords {
  const words = useContext(ClientWordsContext);
  if (!words) throw new Error("useClientWords must be used inside a ClientWordsProvider.");
  return words;
}
