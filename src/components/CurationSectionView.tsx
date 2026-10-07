import { sectionIsEmpty, type CurationSectionData } from "@/lib/curationSections";

// One curation section as visitors see it (2026-10-06; shared
// 2026-10-07) — in the curation panel on a Canvas page (CurationPanel),
// and in a Private / Custom page's component it's been put in
// (PagePreview). Text sections are plain text. An empty section shows
// nothing.
export default function CurationSectionView({ section }: { section: CurationSectionData }) {
  if (sectionIsEmpty(section)) return null;
  switch (section.type) {
    case "TAGLINE":
      return <p className="text-center text-base italic text-neutral-700">{section.text}</p>;

    case "DESCRIPTION":
      return (
        <p className="whitespace-pre-line break-words text-sm text-neutral-800">{section.text}</p>
      );

    case "TEXT":
      return (
        <div>
          {section.heading && (
            <h3 className="mb-1 text-base font-medium text-neutral-900">{section.heading}</h3>
          )}
          {section.text && (
            <p className="whitespace-pre-line break-words text-sm text-neutral-800">
              {section.text}
            </p>
          )}
        </div>
      );

    case "VIDEO": {
      const video = section.media[0];
      return (
        <video
          src={video.url}
          poster={video.posterUrl ?? undefined}
          controls
          className="w-full rounded-md bg-black"
        />
      );
    }

    case "IMAGES":
      return (
        <div className="flex flex-col gap-2">
          {section.media.map((m) => (
            <img key={m.imageId} src={m.url} alt="" className="w-full rounded-md" />
          ))}
        </div>
      );
  }
}
