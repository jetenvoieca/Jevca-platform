"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { sendToHopper } from "@/lib/hopperUpload";
import { fieldCls, NoticeLine, panelCls, StudioButton } from "@/components/studio/StudioUi";
import type { Notice } from "@/components/studio/StudioUi";

// "Add new Artwork": get a photo — from the phone's library or straight
// from its camera — and send it to the artist's Hopper, with or without
// details. Screens follow the design mock-ups: add (+) → [the phone's own
// photo picker or camera] → review → details.

type Screen = "add" | "review" | "details";
type Details = { title: string; size: string; price: string; type: string; description: string };

const EMPTY_DETAILS: Details = { title: "", size: "", price: "", type: "", description: "" };

// Recorded on every Hopper item sent from here — see the note on
// `source` in src/app/api/hopper/finalize/route.ts.
const SOURCE = "Studio";

// Accepts "1200", "1 200", "1200,50" or "1200.50". Returns the plain
// number string the server expects, "" when left blank, or null when
// it isn't a valid price.
function parsePrice(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return "";
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? cleaned : null;
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldCls} appearance-none [text-align-last:center] ${
        value ? "text-[#555]" : "text-[#8a8a8a]"
      }`}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export default function AddArtwork({
  token,
  artworkTypes,
  sizePresets,
  onDone,
  onBusyChange,
}: {
  token: string;
  artworkTypes: string[];
  sizePresets: string[];
  // Called once the photo is safely in the Hopper — the app returns to
  // its first screen showing this message.
  onDone: (notice: Notice) => void;
  // Lets the app stop the artist leaving while a photo is being sent.
  onBusyChange: (busy: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>("add");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const go = (next: Screen) => {
    setNotice(null);
    setScreen(next);
  };

  const openLibrary = () => libraryRef.current?.click();
  const openCamera = () => cameraRef.current?.click();

  // Shared by the library picker and the camera — either way the result
  // is one photo, handled identically from here on.
  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Cleared so choosing the same photo again still fires onChange.
    e.target.value = "";
    if (!picked) return;
    setFile(picked);
    setDetails(EMPTY_DETAILS);
    go("review");
  };

  const setDetail = (field: keyof Details) => (value: string) =>
    setDetails((d) => ({ ...d, [field]: value }));

  const send = async (withDetails: boolean) => {
    if (!file) return;

    let artworkPrice: string | undefined;
    if (withDetails) {
      const price = parsePrice(details.price);
      if (price === null) {
        setNotice({ text: "Price must be a number, e.g. 1200 or 1200.50", tone: "error" });
        return;
      }
      artworkPrice = price || undefined;
    }

    setSending(true);
    onBusyChange(true);
    setNotice({ text: "Sending…", tone: "info" });
    try {
      await sendToHopper(
        token,
        file,
        SOURCE,
        withDetails
          ? {
              caption: details.title,
              description: details.description,
              artworkSize: details.size,
              artworkPrice,
              artworkType: details.type,
            }
          : {}
      );
      onDone({ text: "Sent to your hopper.", tone: "info" });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Couldn't send. Please try again.",
        tone: "error",
      });
    } finally {
      setSending(false);
      onBusyChange(false);
    }
  };

  return (
    <>
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        onChange={onPicked}
        className="hidden"
      />
      {/* capture="environment" opens the phone's back camera directly. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPicked}
        className="hidden"
      />

      {screen === "add" && (
        <>
          <section className={`${panelCls} aspect-square`}>
            <button
              type="button"
              onClick={openLibrary}
              aria-label="Choose Photos"
              className="flex h-full w-full items-center justify-center text-7xl text-[#8a8a8a]"
            >
              +
            </button>
          </section>
          <NoticeLine notice={notice} />
          <section className={`${panelCls} p-4`}>
            <div className="flex gap-4">
              <StudioButton onClick={openLibrary}>Choose Photos</StudioButton>
              <StudioButton onClick={openCamera}>Take a photo</StudioButton>
            </div>
          </section>
        </>
      )}

      {screen === "review" && (
        <>
          <section className={`${panelCls} aspect-square overflow-hidden`}>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Chosen artwork"
                className="h-full w-full object-contain"
              />
            )}
          </section>
          <NoticeLine notice={notice} />
          <section className={`${panelCls} p-4`}>
            <div className="flex gap-4">
              <StudioButton onClick={() => go("details")} disabled={sending}>
                Add Details
              </StudioButton>
              <StudioButton onClick={() => send(false)} disabled={sending}>
                Do it Later
              </StudioButton>
            </div>
          </section>
        </>
      )}

      {screen === "details" && (
        <>
          <section className={`${panelCls} flex flex-col gap-3 p-4`}>
            <div className="flex gap-4">
              <div className="w-1/4 shrink-0">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Chosen artwork"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3">
                <Dropdown
                  label="Size"
                  value={details.size}
                  options={sizePresets}
                  onChange={setDetail("size")}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Price"
                  aria-label="Price"
                  value={details.price}
                  onChange={(e) => setDetail("price")(e.target.value)}
                  className={`${fieldCls} text-[#555] placeholder:text-[#8a8a8a]`}
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="Title / name"
              aria-label="Title / name"
              value={details.title}
              onChange={(e) => setDetail("title")(e.target.value)}
              className={`${fieldCls} text-[#555] placeholder:text-[#8a8a8a]`}
            />
            <Dropdown
              label="Type"
              value={details.type}
              options={artworkTypes}
              onChange={setDetail("type")}
            />
            <textarea
              placeholder="Description"
              aria-label="Description"
              rows={5}
              value={details.description}
              onChange={(e) => setDetail("description")(e.target.value)}
              className={`${fieldCls} text-[#555] placeholder:text-[#8a8a8a] ${
                details.description ? "text-left" : "text-center"
              }`}
            />
          </section>
          <NoticeLine notice={notice} />
          <section className={`${panelCls} p-4`}>
            <div className="flex gap-4">
              <StudioButton onClick={() => send(true)} disabled={sending}>
                Ok
              </StudioButton>
            </div>
          </section>
        </>
      )}
    </>
  );
}
