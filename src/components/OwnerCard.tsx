"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateArtist, buildArtistFormData, type ArtistFormFields } from "@/lib/actions";
import { toArtistFormFields, type ArtistRecord } from "@/lib/clientPanelTypes";
import { EMAIL_DOMAIN } from "@/lib/email";

const labelCls = "mb-1 block text-xs text-neutral-500";
const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50";
const cardCls = "rounded-lg border border-neutral-200 bg-white p-4";
const cardTitleCls = "mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500";

type Field = "name" | "firstName" | "email" | "phone" | "emailSlug";

// The Owner identity fields (Name / First name / Email / Phone / Email
// address) — split out of the old SiteSettingsPanel (2026-09-12) so the
// same card can be reused on both the per-site "Profile" page
// (SiteSettingsPanel) and the Administration → Clients page
// (ClientOwnerPanel). Saves via the same updateArtist action either page
// used before; buildArtistFormData resubmits every other artist field
// unchanged (see the note there) so this card never needs to know about
// fields it doesn't show.
export default function OwnerCard({
  artist,
  className = "",
}: {
  artist: ArtistRecord;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<Field | null>(null);
  const router = useRouter();

  const flash = (field: Field) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  };

  const save = (field: Field, value: string) => {
    let changes: Partial<ArtistFormFields> & { emailSlug?: string };
    switch (field) {
      case "name":
        changes = { name: value };
        break;
      case "firstName":
        changes = { firstName: value };
        break;
      case "email":
        changes = { email: value };
        break;
      case "phone":
        changes = { phone: value };
        break;
      case "emailSlug":
        changes = { emailSlug: value };
        break;
    }
    const fd = buildArtistFormData(toArtistFormFields(artist), changes);
    startTransition(async () => {
      await updateArtist(artist.id, fd);
      router.refresh();
      flash(field);
    });
  };

  return (
    <div className={`${cardCls} ${className}`}>
      <p className={cardTitleCls}>Owner</p>

      <div className="space-y-2">
        <div>
          <label className={labelCls}>Name</label>
          <input
            key={`owner-name-${artist.id}`}
            type="text"
            defaultValue={artist.name}
            onBlur={(e) => e.target.value.trim() && save("name", e.target.value.trim())}
            disabled={isPending}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>First name (for personalised emails)</label>
          <input
            key={`owner-firstname-${artist.id}`}
            type="text"
            defaultValue={artist.firstName || ""}
            onBlur={(e) => save("firstName", e.target.value.trim())}
            disabled={isPending}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            key={`owner-email-${artist.id}`}
            type="email"
            defaultValue={artist.email || ""}
            onBlur={(e) => save("email", e.target.value.trim())}
            disabled={isPending}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            key={`owner-phone-${artist.id}`}
            type="text"
            defaultValue={artist.phone || ""}
            onBlur={(e) => save("phone", e.target.value.trim())}
            disabled={isPending}
            className={inputCls}
          />
        </div>
        {/* This artist's own sending/receiving address (2026-09-05,
            Email Integration) — auto-suggested from their name when
            created, editable here. The @jevca.art suffix is fixed and
            shown alongside rather than typed, so it can never be
            mistyped into something that isn't actually this platform's
            domain. */}
        <div>
          <label className={labelCls}>Email address (for sending/receiving)</label>
          <div className="flex items-center gap-1">
            <input
              key={`owner-email-slug-${artist.id}`}
              type="text"
              defaultValue={artist.emailSlug || ""}
              placeholder="e.g. louise.dear"
              onBlur={(e) => e.target.value.trim() && save("emailSlug", e.target.value.trim())}
              disabled={isPending}
              className={inputCls}
            />
            <span className="shrink-0 text-sm text-neutral-400">@{EMAIL_DOMAIN}</span>
          </div>
          {!artist.emailSlug && (
            <p className="mt-1 text-xs text-amber-700">
              Not set yet — invoices/receipts/certificates can't be emailed until this has a
              value.
            </p>
          )}
        </div>
        {savedField && <p className="text-xs text-green-600">Saved</p>}
      </div>
    </div>
  );
}
