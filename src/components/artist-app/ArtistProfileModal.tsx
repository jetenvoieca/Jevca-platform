"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateArtistContact,
  updateArtistProfileText,
  type ArtistContactField,
  type ArtistProfileTextField,
} from "@/lib/actions";
import { uploadArtistLogo } from "@/lib/artistLogoUpload";
import { useBackdropClose } from "@/lib/useBackdropClose";

// The Artist App's Profile window (2026-11-08, Craig's mockup): the
// client's contact details, address, Instagram and Facebook, and Logo —
// each saved when its box is left (the Logo when chosen).

export type ArtistProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  logoUrl: string | null;
};

export default function ArtistProfileModal({ artist, onClose }: { artist: ArtistProfile; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Leaving the box being edited first, so its change is saved.
  const close = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };
  const backdrop = useBackdropClose(close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveContact = async (field: ArtistContactField, value: string, was: string | null) => {
    if (value.trim() === (was ?? "")) return;
    setError(null);
    const result = await updateArtistContact(artist.id, field, value);
    if ("error" in result) setError(result.error);
    else router.refresh();
  };

  const saveProfileText = async (field: ArtistProfileTextField, value: string, was: string | null) => {
    if (value.trim() === (was ?? "")) return;
    setError(null);
    try {
      await updateArtistProfileText(artist.id, field, value);
      router.refresh();
    } catch {
      setError("That wasn't saved — please try again.");
    }
  };

  const pickLogo = async (file: File) => {
    setUploading(true);
    setError(null);
    const problem = await uploadArtistLogo(artist.id, file).catch(() => "Upload failed — please try again.");
    setUploading(false);
    if (problem) setError(problem);
    else router.refresh();
  };

  const labelCls = "mb-1 block text-sm text-neutral-500";
  const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-base text-neutral-900";
  const helpCls = "mt-1 text-xs text-neutral-400";

  const contactInput = (field: ArtistContactField, label: string, was: string | null, type = "text") => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        defaultValue={was ?? ""}
        onBlur={(e) => saveContact(field, e.target.value, was)}
        className={inputCls}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" {...backdrop}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold text-neutral-900">Profile</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:w-2/3">
            {contactInput("name", "Name", artist.name)}
            {contactInput("email", "Email", artist.email, "email")}
            {contactInput("phone", "Phone", artist.phone, "tel")}
          </div>

          <div>
            <label className={labelCls}>Artist address (for invoices)</label>
            <textarea
              defaultValue={artist.addressLine1 ?? ""}
              onBlur={(e) => saveContact("addressLine1", e.target.value, artist.addressLine1)}
              rows={2}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {contactInput("city", "City", artist.city)}
            {contactInput("postcode", "Postcode", artist.postcode)}
            {contactInput("country", "Country", artist.country)}
          </div>

          <div>
            <label className={labelCls}>Instagram username</label>
            <input
              type="text"
              defaultValue={artist.instagramHandle ?? ""}
              onBlur={(e) => saveProfileText("instagramHandle", e.target.value, artist.instagramHandle)}
              className={inputCls}
            />
            <p className={helpCls}>
              Shown as &ldquo;Or DM on Instagram&rdquo; on the website&rsquo;s enquiry form, and under a Side list
              menu. Re-publish the site after changing it.
            </p>
          </div>
          <div>
            <label className={labelCls}>Facebook page</label>
            <input
              type="text"
              defaultValue={artist.facebookUrl ?? ""}
              onBlur={(e) => saveProfileText("facebookUrl", e.target.value, artist.facebookUrl)}
              className={inputCls}
            />
            <p className={helpCls}>Shown under a Side list menu on the website. Re-publish the site after changing it.</p>
          </div>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Choose a logo"
            className="mt-2 flex h-32 w-48 items-center justify-center rounded-md border border-neutral-300 p-3 text-lg text-neutral-700 hover:bg-neutral-50"
          >
            {uploading ? (
              <span className="text-sm text-neutral-400">Uploading…</span>
            ) : artist.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artist.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              "Logo"
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) pickLogo(file);
            }}
          />
        </div>
      </div>
    </div>
  );
}
