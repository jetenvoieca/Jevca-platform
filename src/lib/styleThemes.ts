// Page and menu styles grouped under themes (2026-11-02, Craig's mockup).
// A style's theme is the start of its name, before " — " ("Bling — Home"
// is in Bling); a name without one is in General. Renaming a style moves
// it. Themes are listed A–Z with General last; the styles in each keep
// the order they were given in.
export const GENERAL_THEME = "General";

const THEME_SEPARATOR = /\s+[—–-]\s+/;

export function styleTheme(name: string): string {
  const match = THEME_SEPARATOR.exec(name);
  const theme = match ? name.slice(0, match.index).trim() : "";
  return theme || GENERAL_THEME;
}

export type ThemeGroup<T> = { theme: string; items: T[] };

export function groupByTheme<T extends { name: string }>(items: T[]): ThemeGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const theme = styleTheme(item.name);
    groups.set(theme, [...(groups.get(theme) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([theme, list]) => ({ theme, items: list }))
    .sort((a, b) => {
      if (a.theme === GENERAL_THEME) return 1;
      if (b.theme === GENERAL_THEME) return -1;
      return a.theme.localeCompare(b.theme, "en", { sensitivity: "base" });
    });
}
