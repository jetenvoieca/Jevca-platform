import { db } from "@/lib/db";
import { listBucket, removeFromBucket } from "@/lib/actions/hopper";
import VideoThumb from "@/components/VideoThumb";

export const dynamic = "force-dynamic";

export default async function BucketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await db.site.findUnique({ where: { id }, select: { artistId: true } });
  const artistId = site!.artistId;

  const items = await listBucket(artistId);

  return (
    <div className="px-6 py-4">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">
        Bucket <span className="text-base font-normal text-neutral-400">({items.length})</span>
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Media staged for the Video Editor. The full strip — reorder, trim, cut — is coming next;
        for now this just confirms what&apos;s landed here and lets you take something back out.
      </p>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
          Bucket is empty — add items from the Hopper.
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
            >
              {item.kind === "VIDEO" ? (
                item.posterUrl ? (
                  <img src={item.posterUrl} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <VideoThumb src={item.url} className="aspect-square w-full object-cover" />
                )
              ) : (
                <img src={item.url} alt="" className="aspect-square w-full object-cover" />
              )}
              <form action={removeFromBucket.bind(null, item.id, id)} className="p-2">
                <button
                  type="submit"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
