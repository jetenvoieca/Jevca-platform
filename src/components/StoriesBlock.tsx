import type { ProfileGalleryRow, ProfileStoryRow } from "@/lib/actions/profileStories";
import { bodyTextCss } from "@/components/textStyleCss";
import type { StoriesSettings } from "@/lib/pageStyleLayout";
import type { PageStory } from "@/lib/pageStories";
import PictureWordsBlock from "@/components/PictureWordsBlock";

// Profile stories on a page (2026-10-26 — see StoriesSettings in
// lib/pageStyleLayout.ts): the stories chosen on the page, in its order,
// stacked `storySpace` apart — each its picture or video beside its
// caption and story, as a Picture & words, the picture on the style's
// side or, swapped on the page, the other. A story no longer in the
// Profile Catalogue, or with nothing to show, is left out — a fixed entry
// (2026-11-03) with no text, picture or galleries too, as its fixed name
// alone isn't anything to show. A Galleries entry lists its galleries
// under its text: each its name and town, then its website as a link.
export default function StoriesBlock({
  settings,
  chosen,
  stories,
  contentWidth,
}: {
  settings: StoriesSettings;
  chosen: PageStory[];
  stories: ProfileStoryRow[];
  contentWidth: number;
}) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const shown = chosen.flatMap((c) => {
    const story = byId.get(c.id);
    return story &&
      (story.media || story.story || story.galleries.length > 0 || (story.kind === "STORY" && story.caption))
      ? [{ story, swap: c.swap }]
      : [];
  });
  if (shown.length === 0) return null;
  const flip = (side: StoriesSettings["side"]) =>
    side === "left" ? "right" : "left";

  return (
    <div className="flex flex-col" style={{ gap: settings.storySpace }}>
      {shown.map(({ story, swap }) => (
        <PictureWordsBlock
          key={story.id}
          settings={{
            ...settings,
            side: swap ? flip(settings.side) : settings.side,
          }}
          picture={storyPicture(story)}
          headline={story.caption}
          accent=""
          body={story.story || null}
          after={
            story.galleries.length > 0 && (
              <GalleryList galleries={story.galleries} settings={settings} contentWidth={contentWidth} />
            )
          }
          contentWidth={contentWidth}
        />
      ))}
    </div>
  );
}

// A story's picture (its display size) or video (with its still picture).
export function storyPicture(story: ProfileStoryRow) {
  const m = story.media;
  if (!m) return null;
  return {
    media:
      m.kind === "VIDEO"
        ? { kind: "VIDEO" as const, url: m.fullUrl, posterUrl: m.displayUrl }
        : {
            kind: "PHOTO" as const,
            url: m.displayUrl ?? m.fullUrl,
            posterUrl: null,
          },
    alt: story.caption,
  };
}

// A website address as a link: as typed, or with https:// in front when
// typed without (e.g. "www.gallery.com").
function linkOf(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

// A Galleries entry's galleries, in the stories' text look: each its
// name and town, then its website (its name, or else its address) as a
// link, opening in a new tab.
function GalleryList({
  galleries,
  settings,
  contentWidth,
}: {
  galleries: ProfileGalleryRow[];
  settings: StoriesSettings;
  contentWidth: number;
}) {
  return (
    <ul
      className="mt-4 flex flex-col gap-3"
      style={{ ...bodyTextCss(settings.body, contentWidth), lineHeight: 1.5 }}
    >
      {galleries.map((g) => (
        <li key={g.locationId}>
          <span className="block">{[g.name, g.town].filter(Boolean).join(", ")}</span>
          {g.websiteUrl && (
            <a
              href={linkOf(g.websiteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-70"
            >
              {g.websiteName || g.websiteUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
