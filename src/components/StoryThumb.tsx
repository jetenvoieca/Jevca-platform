import type { ProfileStoryRow } from "@/lib/actions/profileStories";
import { PlayMark } from "@/components/SectionMediaView";

// A Profile Catalogue story's small picture in Arrange (2026-10-26): its
// picture, or a video's still picture with ▶.
export function StoryThumb({
  story,
  className,
}: {
  story: ProfileStoryRow;
  className: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded bg-neutral-100 ${className}`}
    >
      {story.media?.thumbUrl && (
        <img
          src={story.media.thumbUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      )}
      {story.media?.kind === "VIDEO" && <PlayMark />}
    </div>
  );
}
