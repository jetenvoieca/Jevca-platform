"use client";

import { useState, type ReactNode } from "react";
import {
  BUTTON_DEFAULT_COLOUR,
  BUTTON_DEFAULT_TEXT_COLOUR,
  MAX_GALLERY_PICTURES,
  MAX_TEXT_GRID_CELLS,
  pictureKey,
  type BlockContent,
  type ButtonContent,
  type MailLanguage,
  type MailPicture,
} from "@/lib/mailContent";
import { cleanLinkUrl, EMPTY_RICH_TEXT } from "@/lib/richText";
import type { MailPictureThumb } from "@/lib/actions/campaigns";
import RichTextField from "@/components/RichTextField";
import MediaPicker from "@/components/MediaPicker";
import ArtworkPicker from "@/components/ArtworkPicker";
import { ColourControl } from "@/components/layoutControls";

// A campaign mail component's content, typed straight into the
// component in the mail's editor (2026-10-08, from Craig's mockup: the
// template gives the form, filled in place). Shows one language at a
// time — the EN | FR switch above the editor; pictures, artworks, links
// and colours are the same in both. Pressing inside never starts a drag
// (the component is moved by its label strip). Every change goes
// straight to `onChange`; the mail saves itself. `revision` changes when
// the content is replaced from outside (Translate now), so the text
// boxes start again from it.

export type PictureThumbs = Record<string, MailPictureThumb>;

// What the picture and artwork slots need: who's choosing, and the
// thumbnails already known.
export type PickerContext = {
  artistId: string;
  siteId: string;
  thumbs: PictureThumbs;
  onThumb: (key: string, thumb: MailPictureThumb) => void;
};

const LANGUAGE_NAMES: Record<MailLanguage, string> = { en: "English", fr: "French" };

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400";

export default function MailBlockContent({
  blockId,
  content,
  language,
  revision,
  onChange,
  pickers,
}: {
  blockId: string;
  content: BlockContent;
  language: MailLanguage;
  revision: number;
  onChange: (content: BlockContent) => void;
  pickers: PickerContext;
}) {
  const inLanguage = LANGUAGE_NAMES[language];
  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="cursor-default">
      {content.type === "header" && (
        <input
          type="text"
          value={content.text[language]}
          onChange={(e) =>
            onChange({ ...content, text: { ...content.text, [language]: e.target.value } })
          }
          placeholder="Type header in here"
          aria-label={`Header in ${inLanguage}`}
          className={`${inputClass} text-center text-base`}
        />
      )}

      {content.type === "text" && (
        <RichTextField
          key={`${blockId}:${language}:${revision}`}
          label={`Text · ${inLanguage}`}
          value={content.text[language]}
          onChange={(doc) => onChange({ ...content, text: { ...content.text, [language]: doc } })}
        />
      )}

      {content.type === "textgrid" && (
        <div className="flex flex-col gap-2">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${content.cells.length}, minmax(0, 1fr))` }}
          >
            {content.cells.map((cell, i) => (
              <div key={`${i}:${content.cells.length}`} className="relative">
                <RichTextField
                  key={`${blockId}:${i}:${content.cells.length}:${language}:${revision}`}
                  label={`Column ${i + 1}`}
                  value={cell[language]}
                  onChange={(doc) =>
                    onChange({
                      ...content,
                      cells: content.cells.map((c, j) => (j === i ? { ...c, [language]: doc } : c)),
                    })
                  }
                />
                {content.cells.length > 1 && (
                  <RemoveButton
                    label={`Remove column ${i + 1}`}
                    onClick={() =>
                      onChange({ ...content, cells: content.cells.filter((_, j) => j !== i) })
                    }
                  />
                )}
              </div>
            ))}
          </div>
          {content.cells.length < MAX_TEXT_GRID_CELLS && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...content,
                  cells: [...content.cells, { en: EMPTY_RICH_TEXT, fr: EMPTY_RICH_TEXT }],
                })
              }
              className="self-start rounded-md border border-dashed border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              + Add a column
            </button>
          )}
        </div>
      )}

      {content.type === "image" && (
        <PictureSlot
          picture={content.picture}
          pickers={pickers}
          className="aspect-[3/2]"
          onPick={(picture) => onChange({ ...content, picture })}
          onRemove={() => onChange({ ...content, picture: null })}
        />
      )}

      {content.type === "gallery" && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: MAX_GALLERY_PICTURES }, (_, i) => {
            const picture = content.pictures[i] ?? null;
            return (
              <PictureSlot
                key={picture ? `${pictureKey(picture)}:${i}` : `empty:${i}`}
                picture={picture}
                pickers={pickers}
                className="aspect-square"
                onPick={(next) => onChange({ ...content, pictures: [...content.pictures, next] })}
                onRemove={() =>
                  onChange({ ...content, pictures: content.pictures.filter((_, j) => j !== i) })
                }
              />
            );
          })}
        </div>
      )}

      {content.type === "artwork" && (
        <ArtworkSlot
          artworkId={content.artworkId}
          pickers={pickers}
          onChange={(artworkId) => onChange({ ...content, artworkId })}
        />
      )}

      {content.type === "button" && (
        <div className="flex flex-col items-center gap-1">
          <input
            type="text"
            value={content.label[language]}
            onChange={(e) =>
              onChange({ ...content, label: { ...content.label, [language]: e.target.value } })
            }
            placeholder="Button text"
            aria-label={`Button text in ${inLanguage}`}
            className="w-48 rounded-md px-3 py-2 text-center text-sm placeholder:opacity-60"
            style={{
              backgroundColor: content.colour ?? BUTTON_DEFAULT_COLOUR,
              color: content.textColour ?? BUTTON_DEFAULT_TEXT_COLOUR,
            }}
          />
          <p className="max-w-full truncate text-xs text-neutral-400">
            {content.url ?? "No link yet — set it with Link & colours on the component's bar."}
          </p>
        </div>
      )}
    </div>
  );
}

// A Button's link and colours, opened from the component's bar.
export function ButtonSettings({
  content,
  onChange,
}: {
  content: ButtonContent;
  onChange: (content: ButtonContent) => void;
}) {
  const [url, setUrl] = useState(content.url ?? "");
  const [urlError, setUrlError] = useState(false);

  const commitUrl = () => {
    if (!url.trim()) {
      setUrlError(false);
      onChange({ ...content, url: null });
      return;
    }
    const clean = cleanLinkUrl(url);
    setUrlError(!clean);
    if (clean) {
      setUrl(clean);
      onChange({ ...content, url: clean });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(false);
          }}
          onBlur={commitUrl}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitUrl();
          }}
          placeholder="Link — https://…"
          aria-label="Button link"
          className={inputClass}
        />
        {urlError && <p className="text-xs text-red-600">That isn&apos;t a web or email address.</p>}
      </div>
      <ColourControl
        label="Button colour"
        initial={BUTTON_DEFAULT_COLOUR}
        value={content.colour}
        onChange={(colour) => onChange({ ...content, colour })}
      />
      <ColourControl
        label="Text colour"
        initial={BUTTON_DEFAULT_TEXT_COLOUR}
        value={content.textColour}
        onChange={(textColour) => onChange({ ...content, textColour })}
      />
      <p className="text-xs text-neutral-400">A button shows only when it has text and a link.</p>
    </>
  );
}

// One picture: the chosen one with ✕ to remove it, or an empty slot to
// choose one from Media or from an artwork's main image.
function PictureSlot({
  picture,
  pickers,
  className,
  onPick,
  onRemove,
}: {
  picture: MailPicture | null;
  pickers: PickerContext;
  className: string;
  onPick: (picture: MailPicture) => void;
  onRemove: () => void;
}) {
  if (picture) {
    return (
      <Filled
        thumb={pickers.thumbs[pictureKey(picture)]}
        className={className}
        onRemove={onRemove}
      />
    );
  }
  return (
    <EmptySlot className={className}>
      <span className="text-xs text-neutral-400">Add from</span>
      <MediaPicker
        artistId={pickers.artistId}
        siteId={pickers.siteId}
        variant="button"
        label="Media"
        onSelect={(images) => {
          const image = images[0];
          if (!image) return;
          const next: MailPicture = { kind: "media", id: image.id };
          pickers.onThumb(pictureKey(next), { url: image.url, label: image.caption ?? "" });
          onPick(next);
        }}
      />
      <ArtworkPicker
        artistId={pickers.artistId}
        variant="button"
        label="Artwork"
        allowCreate={false}
        onSelect={(artworks) => {
          const a = artworks[0];
          if (!a) return;
          const next: MailPicture = { kind: "artwork", id: a.id };
          pickers.onThumb(pictureKey(next), { url: a.imageUrl, label: a.catalogueName });
          onPick(next);
        }}
      />
    </EmptySlot>
  );
}

// The Artwork Feature's artwork: its picture and name with ✕, or an
// empty slot to choose one.
function ArtworkSlot({
  artworkId,
  pickers,
  onChange,
}: {
  artworkId: string | null;
  pickers: PickerContext;
  onChange: (artworkId: string | null) => void;
}) {
  if (artworkId) {
    const thumb = pickers.thumbs[pictureKey({ kind: "artwork", id: artworkId })];
    return (
      <div className="flex items-center gap-3">
        <Filled thumb={thumb} className="aspect-square w-1/3" onRemove={() => onChange(null)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-neutral-800">{thumb?.label || "Artwork"}</p>
          <p className="text-xs text-neutral-400">
            Shows its image, name, type, size, medium and price.
          </p>
        </div>
      </div>
    );
  }
  return (
    <EmptySlot className="h-32">
      <ArtworkPicker
        artistId={pickers.artistId}
        variant="button"
        label="Choose an artwork"
        allowCreate={false}
        onSelect={(artworks) => {
          const a = artworks[0];
          if (!a) return;
          pickers.onThumb(pictureKey({ kind: "artwork", id: a.id }), {
            url: a.imageUrl,
            label: a.catalogueName,
          });
          onChange(a.id);
        }}
      />
    </EmptySlot>
  );
}

function Filled({
  thumb,
  className,
  onRemove,
}: {
  thumb: MailPictureThumb | undefined;
  className: string;
  onRemove: () => void;
}) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-neutral-200 ${className}`}>
      {thumb?.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb.url} alt={thumb.label} className="h-full w-full object-cover" />
      )}
      <RemoveButton label="Remove picture" onClick={onRemove} />
    </div>
  );
}

function EmptySlot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 p-2 ${className}`}
    >
      {children}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-600 shadow hover:bg-red-50 hover:text-red-600"
    >
      ✕
    </button>
  );
}
