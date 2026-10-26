import type { ProfileStoryRow } from "@/lib/actions/profileStories";
import type { StoriesSettings } from "@/lib/pageStyleLayout";
import type { PageStory } from "@/lib/pageStories";
import PictureWordsBlock from "@/components/PictureWordsBlock";

// Profile stories on a page (2026-10-26 — see StoriesSettings in
// lib/pageStyleLayout.ts): the stories chosen on the page, in its order,
// stacked `storySpace` apart — each its picture or video beside its
// caption and story, as a Picture & words, the picture on the style's
// side or, swapped on the page, the other. A story no longer in the
// Profile Catalogue, or with nothing to show, is left out.
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
    return story && (story.media || story.caption || story.story)
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
