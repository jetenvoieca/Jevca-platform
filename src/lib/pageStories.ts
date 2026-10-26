// A Profile stories component's stories (2026-10-26): the Profile
// Catalogue stories chosen on the page in Arrange, in their order on the
// page, each with `swap` — its picture on the other side from the
// style's. Kept as JSON in the component's content `text`. Plain module,
// so the server action, Arrange and the page share the same clean-up.
// A story deleted from the Profile Catalogue is simply not shown.

export type PageStory = { id: string; swap: boolean };

export const MAX_PAGE_STORIES = 100;

export function readPageStories(text: string | null): PageStory[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as unknown;
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const stories: PageStory[] = [];
    for (const raw of value.slice(0, MAX_PAGE_STORIES)) {
      const v = (raw ?? {}) as { id?: unknown; swap?: unknown };
      if (typeof v.id !== "string" || !v.id || seen.has(v.id)) continue;
      seen.add(v.id);
      stories.push({ id: v.id.slice(0, 64), swap: v.swap === true });
    }
    return stories;
  } catch {
    return [];
  }
}

// The list as saved — null when there's nothing in it.
export function writePageStories(stories: PageStory[]): string | null {
  return stories.length
    ? JSON.stringify(stories.map(({ id, swap }) => ({ id, swap })))
    : null;
}
