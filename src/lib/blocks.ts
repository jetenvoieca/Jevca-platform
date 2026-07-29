export type TextBlock = { id: string; type: "text"; text: string };

export type ImageBlock = {
  id: string;
  type: "image";
  imageId: string;
  url: string;
  caption?: string;
};

export type GalleryBlock = {
  id: string;
  type: "gallery";
  images: { imageId: string; url: string }[];
};

export type ArtworkBlock = {
  id: string;
  type: "artwork";
  artworkId: string;
  // Editor-only preview snapshot — NOT used when actually rendering the page.
  // Rendering always re-fetches the artwork's live title/image/price/status.
  previewTitle?: string;
  previewImageUrl?: string;
};

export type VideoBlock = {
  id: string;
  type: "video";
  imageId: string;
  url: string;
};

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | GalleryBlock
  | ArtworkBlock
  | VideoBlock;
