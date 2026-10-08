"use client";

import { useState } from "react";
import {
  BUTTON_DEFAULT_COLOUR,
  BUTTON_DEFAULT_TEXT_COLOUR,
  MAIL_LANGUAGES,
  MAX_GALLERY_PICTURES,
  MAX_TEXT_GRID_CELLS,
  pictureKey,
  type BlockContent,
  type ButtonContent,
  type Localized,
  type MailLanguage,
  type MailPicture,
} from "@/lib/mailContent";
import { mailBlockTypeLabel } from "@/lib/mailTemplateLayout";
import { cleanLinkUrl, EMPTY_RICH_TEXT, type RichText } from "@/lib/richText";
import type { MailPictureThumb } from "@/lib/actions/campaigns";
import RichTextField from "@/components/RichTextField";
import MediaPicker from "@/components/MediaPicker";
import ArtworkPicker from "@/components/ArtworkPicker";
import { ColourControl } from "@/components/layoutControls";

// A campaign mail component's content (2026-10-08, Marketing step 3),
// opened from the component's Content button: the English and French
// text together, the picture or artwork, or the button's label, link and
// colours. Shown in the right-hand column, outside the visual editor, so
// it's full size and its pickers open normally. Every change goes
// straight to `onChange`; the mail saves itself.

export type PictureThumbs = Record<string, MailPictureThumb>;

const LANGUAGE_NAMES: Record<MailLanguage, string> = { en: "English", fr: "French" };

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400";

export default function MailBlockContentPanel({
  blockId,
  content,
  onChange,
  artistId,
  siteId,
  thumbs,
  onThumb,
  onClose,
}: {
  blockId: string;
  content: BlockContent;
  onChange: (content: BlockContent) => void;
  artistId: string;
  siteId: string;
  thumbs: PictureThumbs;
  onThumb: (key: string, thumb: MailPictureThumb) => void;
  onClose: () => void;
}) {
  const pickers = { artistId, siteId, thumbs, onThumb };
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-300 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <h2 className="text-base text-neutral-800">{mailBlockTypeLabel(content.type)} content</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {content.type === "header" &&
          MAIL_LANGUAGES.map(({ value: lang }) => (
            <input
              key={lang}
              type="text"
              value={content.text[lang]}
              onChange={(e) => onChange({ ...content, text: { ...content.text, [lang]: e.target.value } })}
              placeholder={`Header in ${LANGUAGE_NAMES[lang]}`}
              aria-label={`Header in ${LANGUAGE_NAMES[lang]}`}
              className={inputClass}
            />
          ))}

        {content.type === "text" && (
          <LocalizedRichText
            id={blockId}
            value={content.text}
            onChange={(text) => onChange({ ...content, text })}
          />
        )}

        {content.type === "textgrid" && (
          <>
            {content.cells.map((cell, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-neutral-200 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Column {i + 1}
                  </p>
                  {content.cells.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...content, cells: content.cells.filter((_, j) => j !== i) })
                      }
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <LocalizedRichText
                  id={`${blockId}:${i}:${content.cells.length}`}
                  value={cell}
                  onChange={(next) =>
                    onChange({ ...content, cells: content.cells.map((c, j) => (j === i ? next : c)) })
                  }
                />
              </div>
            ))}
            {content.cells.length < MAX_TEXT_GRID_CELLS && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...content,
                    cells: [...content.cells, { en: EMPTY_RICH_TEXT, fr: EMPTY_RICH_TEXT }],
                  })
                }
                className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                + Add a column
              </button>
            )}
            <p className="text-xs text-neutral-400">
              Up to {MAX_TEXT_GRID_CELLS} columns, side by side. On a phone they stack.
            </p>
          </>
        )}

        {content.type === "image" &&
          (content.picture ? (
            <PictureCard
              picture={content.picture}
              thumbs={thumbs}
              onRemove={() => onChange({ ...content, picture: null })}
            />
          ) : (
            <PicturePickers {...pickers} onPick={(picture) => onChange({ ...content, picture })} />
          ))}

        {content.type === "gallery" && (
          <>
            {content.pictures.map((picture, i) => (
              <PictureCard
                key={`${pictureKey(picture)}:${i}`}
                picture={picture}
                thumbs={thumbs}
                onRemove={() =>
                  onChange({ ...content, pictures: content.pictures.filter((_, j) => j !== i) })
                }
              />
            ))}
            {content.pictures.length < MAX_GALLERY_PICTURES && (
              <PicturePickers
                {...pickers}
                onPick={(picture) => onChange({ ...content, pictures: [...content.pictures, picture] })}
              />
            )}
            <p className="text-xs text-neutral-400">Up to {MAX_GALLERY_PICTURES} images, side by side.</p>
          </>
        )}

        {content.type === "artwork" &&
          (content.artworkId ? (
            <PictureCard
              picture={{ kind: "artwork", id: content.artworkId }}
              thumbs={thumbs}
              onRemove={() => onChange({ ...content, artworkId: null })}
            />
          ) : (
            <ArtworkPicker
              artistId={artistId}
              variant="button"
              label="Choose an artwork"
              allowCreate={false}
              onSelect={(artworks) => {
                const a = artworks[0];
                if (!a) return;
                onThumb(pictureKey({ kind: "artwork", id: a.id }), { url: a.imageUrl, label: a.catalogueName });
                onChange({ ...content, artworkId: a.id });
              }}
            />
          ))}
        {content.type === "artwork" && (
          <p className="text-xs text-neutral-400">
            Shows the artwork&apos;s image, name, type, size, medium and price.
          </p>
        )}

        {content.type === "button" && <ButtonFields content={content} onChange={onChange} />}
      </div>
      <div className="flex justify-end border-t border-neutral-200 p-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// The English and French versions of a formatted text, one above the
// other. `id` changes whenever the boxes should start again from `value`.
function LocalizedRichText({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Localized<RichText>;
  onChange: (value: Localized<RichText>) => void;
}) {
  return (
    <>
      {MAIL_LANGUAGES.map(({ value: lang }) => (
        <RichTextField
          key={`${id}:${lang}`}
          label={LANGUAGE_NAMES[lang]}
          value={value[lang]}
          onChange={(doc) => onChange({ ...value, [lang]: doc })}
        />
      ))}
    </>
  );
}

// A chosen picture or artwork, with Remove.
function PictureCard({
  picture,
  thumbs,
  onRemove,
}: {
  picture: MailPicture;
  thumbs: PictureThumbs;
  onRemove: () => void;
}) {
  const thumb = thumbs[pictureKey(picture)];
  return (
    <div className="flex items-center gap-3 rounded-md border border-neutral-300 p-2">
      {thumb?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb.url} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded bg-neutral-200" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-800">{thumb?.label || "Image"}</p>
        <p className="text-xs text-neutral-400">{picture.kind === "artwork" ? "Artwork" : "Media"}</p>
      </div>
      <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:underline">
        Remove
      </button>
    </div>
  );
}

// Choose a picture from the Media catalogue, or an artwork's main image.
function PicturePickers({
  artistId,
  siteId,
  onThumb,
  onPick,
}: {
  artistId: string;
  siteId: string;
  thumbs: PictureThumbs;
  onThumb: (key: string, thumb: MailPictureThumb) => void;
  onPick: (picture: MailPicture) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <MediaPicker
        artistId={artistId}
        siteId={siteId}
        label="From Media"
        previewClassName="aspect-[3/2]"
        onSelect={(images) => {
          const image = images[0];
          if (!image) return;
          const picture: MailPicture = { kind: "media", id: image.id };
          onThumb(pictureKey(picture), { url: image.url, label: image.caption ?? "" });
          onPick(picture);
        }}
      />
      <div className="flex items-center justify-center">
        <ArtworkPicker
          artistId={artistId}
          variant="button"
          label="From artworks"
          allowCreate={false}
          onSelect={(artworks) => {
            const a = artworks[0];
            if (!a) return;
            const picture: MailPicture = { kind: "artwork", id: a.id };
            onThumb(pictureKey(picture), { url: a.imageUrl, label: a.catalogueName });
            onPick(picture);
          }}
        />
      </div>
    </div>
  );
}

// A button's label (English and French), where it goes, and its colours.
function ButtonFields({
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
      {MAIL_LANGUAGES.map(({ value: lang }) => (
        <input
          key={lang}
          type="text"
          value={content.label[lang]}
          onChange={(e) => onChange({ ...content, label: { ...content.label, [lang]: e.target.value } })}
          placeholder={`Button text in ${LANGUAGE_NAMES[lang]}`}
          aria-label={`Button text in ${LANGUAGE_NAMES[lang]}`}
          className={inputClass}
        />
      ))}
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(false);
          }}
          onBlur={commitUrl}
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
      <p className="text-xs text-neutral-400">
        A button shows only when it has text and a link. Its place in the mail is set by the layout.
      </p>
    </>
  );
}
