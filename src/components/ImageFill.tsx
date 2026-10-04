import VideoThumb from "@/components/VideoThumb";
import type { ArtworkImage } from "@/lib/artworkImages";

// One image or video's picture, filling its box (2026-10-03) — shared by
// the Artwork Catalogue's and the Curations page's image editors. Videos
// show their poster frame when they have one. `large` uses the bigger
// version, for a big preview.
export default function ImageFill({
  image,
  large = false,
}: {
  image: ArtworkImage;
  large?: boolean;
}) {
  if (image.kind === "VIDEO") {
    return image.posterUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image.posterUrl} alt="" className="h-full w-full object-cover" />
    ) : (
      <VideoThumb src={image.url} className="h-full w-full object-cover" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={large ? image.displayUrl : image.url} alt="" className="h-full w-full object-cover" />
  );
}
