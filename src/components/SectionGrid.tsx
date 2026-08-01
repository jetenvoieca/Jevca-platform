export type SectionArtworkTile = {
  id: string;
  presentationTitle: string;
  imageUrl: string | null;
  presentationPrice: string | null;
};

export default function SectionGrid({
  title,
  byline,
  artworks,
}: {
  title: string;
  byline: string;
  artworks: SectionArtworkTile[];
}) {
  return (
    <div>
      <h1 className="mb-2 text-3xl font-semibold text-neutral-900">{title}</h1>
      {byline && <p className="mb-6 text-neutral-600">{byline}</p>}

      {artworks.length === 0 ? (
        <p className="text-sm text-neutral-400">No artworks added yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {artworks.map((a) => (
            <div key={a.id}>
              {a.imageUrl ? (
                <img
                  src={a.imageUrl}
                  alt=""
                  className="aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
                  No image
                </div>
              )}
              <p className="mt-1 truncate text-sm font-medium text-neutral-900">
                {a.presentationTitle}
              </p>
              {a.presentationPrice && (
                <p className="text-xs text-neutral-500">£{a.presentationPrice}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
