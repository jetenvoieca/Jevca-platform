import type { ContentBlock } from "@/lib/blocks";

type ArtworkData = {
  id: string;
  presentationTitle: string;
  presentationPrice: unknown;
  availability: string;
  images: { url: string }[];
};

export default function BlockRenderer({
  blocks,
  artworks,
}: {
  blocks: ContentBlock[];
  artworks: ArtworkData[];
}) {
  return (
    <div className="space-y-6">
      {blocks.map((block) => {
        if (block.type === "header") {
          return block.text ? (
            <h1 key={block.id} className="text-3xl font-semibold text-neutral-900">
              {block.text}
            </h1>
          ) : null;
        }
        if (block.type === "text") {
          return (
            <p key={block.id} className="whitespace-pre-wrap text-neutral-800">
              {block.text}
            </p>
          );
        }
        if (block.type === "image") {
          return block.url ? (
            <figure key={block.id}>
              <img src={block.url} alt={block.caption || ""} className="w-full rounded-md" />
              {block.caption && (
                <figcaption className="mt-1 text-sm text-neutral-500">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          ) : null;
        }
        if (block.type === "gallery") {
          return (
            <div key={block.id} className="grid grid-cols-2 gap-2">
              {block.images.map((img) => (
                <img key={img.imageId} src={img.url} alt="" className="rounded-md" />
              ))}
            </div>
          );
        }
        if (block.type === "video") {
          return block.url ? (
            <video key={block.id} src={block.url} controls className="w-full rounded-md" />
          ) : null;
        }
        if (block.type === "artwork") {
          const artwork = artworks.find((a) => a.id === block.artworkId);
          if (!artwork) return null;
          return (
            <div key={block.id} className="flex gap-4 rounded-md border border-neutral-200 p-4">
              {artwork.images[0] && (
                <img
                  src={artwork.images[0].url}
                  alt=""
                  className="h-32 w-32 rounded object-cover"
                />
              )}
              <div>
                <h3 className="font-medium text-neutral-900">{artwork.presentationTitle}</h3>
                {artwork.presentationPrice != null && (
                  <p className="text-sm text-neutral-600">£{String(artwork.presentationPrice)}</p>
                )}
                <p className="text-xs uppercase text-neutral-400">{artwork.availability}</p>
              </div>
            </div>
          );
        }
        if (block.type === "textgrid") {
          const rows = block.rows.filter((r) => r.cell1 || r.cell2 || r.cell3);
          if (rows.length === 0) return null;
          return (
            <table key={block.id} className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-300">
                  {block.columns.map((col, i) => (
                    <th key={i} className="py-2 pr-4 font-medium text-neutral-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-800">{row.cell1}</td>
                    <td className="py-2 pr-4 text-neutral-800">{row.cell2}</td>
                    <td className="py-2 pr-4 text-neutral-800">{row.cell3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        return null;
      })}
    </div>
  );
}
