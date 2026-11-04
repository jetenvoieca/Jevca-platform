"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteMarketingContact,
  saveMarketingContact,
  type MarketingContactInput,
  type MarketingContactRow,
  type MarketingContactType,
} from "@/lib/actions/marketingContacts";
import AddIconButton from "@/components/AddIconButton";
import FormModal from "@/components/FormModal";
import { inputCls, labelCls, primaryButtonCls, secondaryButtonCls } from "@/components/subscriberFormParts";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list — a table of artists and galleries, shown All /
// Galleries / Artists and searched by any of their details; ⊞ beside the
// heading adds one, and clicking a row edits it in a window, where it can
// also be deleted.

const TYPE_LABEL: Record<MarketingContactType, string> = { GALLERY: "Gallery", ARTIST: "Artist" };
const SHOWING = [
  { value: "ALL", label: "All" },
  { value: "GALLERY", label: "Galleries" },
  { value: "ARTIST", label: "Artists" },
] as const;
type Showing = (typeof SHOWING)[number]["value"];

const EMPTY: MarketingContactInput = {
  type: "GALLERY",
  name: "",
  email: "",
  phone: "",
  website: "",
  instagram: "",
  tiktok: "",
  town: "",
  country: "",
  notes: "",
};

// Links for what was typed: a full address as it is, otherwise the site
// or the account's page.
const handle = (v: string) => v.trim().replace(/^@/, "");
const isAddress = (v: string) => /^https?:\/\//i.test(v.trim());
const websiteLink = (v: string) => (isAddress(v) ? v.trim() : `https://${v.trim()}`);
const instagramLink = (v: string) => (isAddress(v) ? v.trim() : `https://www.instagram.com/${handle(v)}`);
const tiktokLink = (v: string) => (isAddress(v) ? v.trim() : `https://www.tiktok.com/@${handle(v)}`);

export default function MarketingContactsView({ contacts: initial }: { contacts: MarketingContactRow[] }) {
  const [contacts, setContacts] = useState(initial);
  const [showing, setShowing] = useState<Showing>("ALL");
  const [search, setSearch] = useState("");
  // The contact being edited — "new" for Add.
  const [editing, setEditing] = useState<MarketingContactRow | "new" | null>(null);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return contacts.filter((c) => {
      if (showing !== "ALL" && c.type !== showing) return false;
      const all = [c.name, c.email, c.phone, c.website, c.instagram, c.tiktok, c.town, c.country, c.notes]
        .join(" ")
        .toLowerCase();
      return words.every((w) => all.includes(w));
    });
  }, [contacts, showing, search]);

  const saved = (contact: MarketingContactRow) => {
    setContacts((old) =>
      [...old.filter((c) => c.id !== contact.id), contact].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditing(null);
  };
  const deleted = (id: string) => {
    setContacts((old) => old.filter((c) => c.id !== id));
    setEditing(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900">Contacts</h1>
        <AddIconButton label="Add a contact" onClick={() => setEditing("new")} />
      </div>
      <p className="mb-6 text-sm text-neutral-500">Artists and galleries to keep in touch with.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
          {SHOWING.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setShowing(s.value)}
              className={`px-3 py-1.5 ${showing === s.value ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className={`${inputCls} max-w-xs`}
        />
        <span className="text-sm text-neutral-500">
          {shown.length} of {contacts.length}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">
          {contacts.length === 0 ? "No contacts yet." : "No contacts match."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                {["Type", "Name", "Email", "Phone", "Website", "Instagram", "TikTok", "Town", "Country"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setEditing(c)}
                  className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{TYPE_LABEL[c.type]}</td>
                  <td className="px-3 py-2 font-medium text-neutral-900">{c.name}</td>
                  <td className="px-3 py-2">
                    {c.email && <ContactLink href={`mailto:${c.email}`} text={c.email} />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{c.phone}</td>
                  <td className="px-3 py-2">
                    {c.website && <ContactLink href={websiteLink(c.website)} text={c.website} newTab />}
                  </td>
                  <td className="px-3 py-2">
                    {c.instagram && <ContactLink href={instagramLink(c.instagram)} text={c.instagram} newTab />}
                  </td>
                  <td className="px-3 py-2">
                    {c.tiktok && <ContactLink href={tiktokLink(c.tiktok)} text={c.tiktok} newTab />}
                  </td>
                  <td className="px-3 py-2">{c.town}</td>
                  <td className="px-3 py-2">{c.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ContactModal
          contact={editing === "new" ? null : editing}
          onSaved={saved}
          onDeleted={deleted}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// A link in a row — clicking it doesn't also open the row.
function ContactLink({ href, text, newTab = false }: { href: string; text: string; newTab?: boolean }) {
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      {...(newTab && { target: "_blank", rel: "noopener noreferrer" })}
      className="break-all text-neutral-700 underline-offset-2 hover:underline"
    >
      {text}
    </a>
  );
}

function ContactModal({
  contact,
  onSaved,
  onDeleted,
  onClose,
}: {
  contact: MarketingContactRow | null;
  onSaved: (contact: MarketingContactRow) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<MarketingContactInput>(contact ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const set = (patch: Partial<MarketingContactInput>) => setValues((v) => ({ ...v, ...patch }));

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveMarketingContact(contact?.id ?? null, values);
      if ("error" in result) return setError(result.error);
      onSaved(result.contact);
    });
  };
  const remove = () => {
    if (!contact) return;
    startTransition(async () => {
      await deleteMarketingContact(contact.id);
      onDeleted(contact.id);
    });
  };

  const field = (key: Exclude<keyof MarketingContactInput, "type" | "notes">, label: string, type = "text") => (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={values[key]} onChange={(e) => set({ [key]: e.target.value })} className={inputCls} />
    </div>
  );

  return (
    <FormModal title={contact ? "Edit contact" : "Add contact"} busy={isPending} onClose={onClose}>
      <div>
        <label className={labelCls}>Type</label>
        <div className="flex gap-4 text-sm text-neutral-700">
          {(["GALLERY", "ARTIST"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input type="radio" checked={values.type === t} onChange={() => set({ type: t })} />
              {TYPE_LABEL[t]}
            </label>
          ))}
        </div>
      </div>
      {field("name", "Name")}
      <div className="grid grid-cols-2 gap-2">
        {field("email", "Email", "email")}
        {field("phone", "Phone", "tel")}
      </div>
      {field("website", "Website")}
      <div className="grid grid-cols-2 gap-2">
        {field("instagram", "Instagram")}
        {field("tiktok", "TikTok")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("town", "Town")}
        {field("country", "Country")}
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={values.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={4}
          className={inputCls}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={save} disabled={isPending || !values.name.trim()} className={primaryButtonCls}>
          {isPending ? "Saving…" : contact ? "Save" : "Add contact"}
        </button>
        {contact &&
          (confirmDelete ? (
            <>
              <span className="ml-auto text-sm text-neutral-600">Delete this contact?</span>
              <button type="button" onClick={remove} disabled={isPending} className={secondaryButtonCls}>
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={secondaryButtonCls}>
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={`${secondaryButtonCls} ml-auto text-red-600`}
            >
              Delete
            </button>
          ))}
      </div>
    </FormModal>
  );
}
