"use client";

import UploadNewImageModal, { type UploadedImage } from "@/components/UploadNewImageModal";
import { linkImagesToArtwork, deleteArtworkMainImage } from "@/lib/actions/artworks";

// "Delete & Replace"'s own limited window onto adding a new image
// (2026-09-13, direct request — "let them upload a brand-new file right
// there, no trip to the full Hopper page"; reworked again the same day
// to wrap the shared UploadNewImageModal instead of duplicating its
// dropzone/chrome — "same idea as delete and adding new main image,
// one set of code"). All this component adds on top of the shared
// modal is what happens once a replacement has actually finished
// uploading: delete the old Main image, then link the new one in as
// the artwork's Main.
//
// The old Main image is deliberately NOT deleted until the replacement
// has actually finished uploading (2026-09-13 fix, direct report — an
// earlier version deleted it the moment "Delete & Replace" was
// clicked, so cancelling this modal left the artwork with no Main image
// at all). oldMainImageId is only ever acted on inside handleUploaded
// below, which UploadNewImageModal only calls after the upload itself
// has already succeeded — cancelling, or any upload failure, leaves the
// existing Main image completely untouched. If the delete step itself
// fails, that error propagates back up to UploadNewImageModal and is
// shown there rather than the modal closing anyway.
export default function SetMainFromHopperModal({
  artworkId,
  siteId,
  artistId,
  oldMainImageId,
  onClose,
  onDone,
}: {
  artworkId: string;
  siteId: string;
  artistId: string;
  // The Main image this replacement is standing in for — deleted only
  // once the new upload has succeeded (see the note above), never
  // before.
  oldMainImageId: string;
  onClose: () => void;
  // Called once the new image is actually set as Main — the caller
  // (ArtworkImageManager) uses this to trigger its own refetch, the
  // same way every other change in that component does.
  onDone: () => void;
}) {
  const handleUploaded = async (image: UploadedImage) => {
    // deleteArtworkMainImage clears mainImageId to null before deleting
    // the row (that FK is Restrict); linkImagesToArtwork then
    // auto-assigns Main to the new image, since there isn't one now.
    const deleteResult = await deleteArtworkMainImage(artworkId, oldMainImageId, siteId);
    if (!deleteResult.ok) {
      throw new Error(deleteResult.error);
    }
    await linkImagesToArtwork(artworkId, [image.id], siteId);
    onDone();
  };

  return (
    <UploadNewImageModal
      artistId={artistId}
      siteId={siteId}
      title="Replace Main image"
      note="The current Main image will be deleted once your replacement finishes uploading."
      onClose={onClose}
      onUploaded={handleUploaded}
    />
  );
}
