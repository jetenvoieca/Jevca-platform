"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteMarketingContact,
  listMarketingContacts,
  saveMarketingContact,
} from "@/lib/actions/marketingContacts";
import {
  CURRENCIES,
  CURRENCY_SIGN,
  EMPTY_CONTACT,
  PRICE_BANDS,
  WORKS_LABEL,
  WORKS_TYPES,
  type MarketingContactInput,
  type MarketingContactLinkRef,
  type MarketingContactRow,
  type MarketingContactType,
  type MarketingCurrency,
  type MarketingWorksType,
} from "@/lib/marketingContacts";
import AddIconButton from "@/components/AddIconButton";
import MarketingContactsImport from "@/components/MarketingContactsImport";
import FormModal from "@/components/FormModal";
import { useAutoSave } from "@/components/useAutoSave";
import { inputCls, labelCls, secondaryButtonCls } from "@/components/subscriberFormParts";

// Administration → Contacts (2026-11-04, Craig's request): the platform's
// own marketing list — a table of artists and galleries, shown All /
// Galleries / Artists and searched by any of their details; ⊞ beside the
// heading adds one, and clicking a row edits it in a window, where it can
// also be deleted. Changes save themselves (useAutoSave, 2026-11-04, as
// the other editors) once it has a name. A gallery lists its artists and an artist their
// galleries (2026-11-04): typing a name suggests existing ones, and a new
// name is added as a contact when saved. A contact also has a contact
// person, a price band, works types and tags (2026-11-06); the list can
// be narrowed to a tag, e.g. "Louise Dear criteria". Import adds
// contacts from a CSV (MarketingContactsImport). The table shows the
// main details only (2026-11-06, Craig); the rest are in the window, and
// search covers them all. The window's fields are in the order Craig
// set out (2026-11-06): prices and works first, then contact details.
// Contacts show as a list or as tiles with a photo of the gallery — a
// link to it on the gallery's own site (2026-11-06).

const TYPE_LABEL: Record<MarketingContactType, string> = { GALLERY: "Gallery", ARTIST: "Artist" };
// What each type lists: a gallery its artists, an artist their galleries.
const LINKS_LABEL: Record<MarketingContactType, string> = { GALLERY: "Artists", ARTIST: "Galleries" };
const otherType = (t: MarketingContactType): MarketingContactType => (t === "GALLERY" ? "ARTIST" : "GALLERY");
const SHOWING = [
  { value: "ALL", label: "All" },
  { value: "GALLERY", label: "Galleries" },
  { value: "ARTIST", label: "Artists" },
] as const;
type Showing = (typeof SHOWING)[number]["value"];
const LAYOUTS = [
  { value: "LIST", label: "List" },
  { value: "TILES", label: "Tiles" },
] as const;
type Layout = (typeof LAYOUTS)[number]["value"];
const MAX_SUGGESTIONS = 8;
const ALL_TAGS = "";

type PriceBand = (typeof PRICE_BANDS)[number];

// A band as "£500–£5,000", "from £500", "up to £5,000", or nothing.
function priceBand(c: MarketingContactRow, band: PriceBand) {
  const [min, max] = [c[band.min], c[band.max]];
  if (!c.priceCurrency) return "";
  const amount = (n: number) => `${CURRENCY_SIGN[c.priceCurrency!]}${n.toLocaleString("en-GB")}`;
  if (min !== null && max !== null) return `${amount(min)}–${amount(max)}`;
  if (min !== null) return `from ${amount(min)}`;
  if (max !== null) return `up to ${amount(max)}`;
  return "";
}
const worksText = (c: Pick<MarketingContactRow, "worksTypes">) => c.worksTypes.map((w) => WORKS_LABEL[w]).join(", ");

// A website as typed, as a link: a full address as it is, otherwise
// the site.
const websiteLink = (v: string) => (/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);

export default function MarketingContactsView({ contacts: initial }: { contacts: MarketingContactRow[] }) {
  const [contacts, setContacts] = useState(initial);
  const [showing, setShowing] = useState<Showing>("ALL");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(ALL_TAGS);
  const [layout, setLayout] = useState<Layout>("LIST");
  // The contact being edited — "new" for Add.
  const [editing, setEditing] = useState<MarketingContactRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  // Every tag a contact has, by name.
  const tags = useMemo(() => {
    const byId = new Map(contacts.flatMap((c) => c.tags).map((t) => [t.id, t]));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);
  // A tag filtered by that has since gone shows everything.
  const activeTag = tags.some((t) => t.id === tagFilter) ? tagFilter : ALL_TAGS;

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return contacts.filter((c) => {
      if (showing !== "ALL" && c.type !== showing) return false;
      if (activeTag && !c.tags.some((t) => t.id === activeTag)) return false;
      const all = [
        c.name,
        c.contactPerson,
        c.email,
        c.phone,
        c.website,
        c.instagram,
        c.tiktok,
        c.town,
        c.country,
        c.notes,
        ...PRICE_BANDS.map((b) => priceBand(c, b)),
        worksText(c),
        ...c.links.map((l) => l.name),
        ...c.tags.map((t) => t.name),
      ]
        .join(" ")
        .toLowerCase();
      return words.every((w) => all.includes(w));
    });
  }, [contacts, showing, activeTag, search]);

  // Gone from the list, and from the others' links.
  const deleted = (id: string) => {
    setContacts((old) =>
      old.filter((c) => c.id !== id).map((c) => ({ ...c, links: c.links.filter((l) => l.id !== id) })),
    );
    setEditing(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900">Contacts</h1>
        <AddIconButton label="Add a contact" onClick={() => setEditing("new")} />
        <button type="button" onClick={() => setImporting(true)} className={`${secondaryButtonCls} ml-auto`}>
          Import
        </button>
      </div>
      <p className="mb-6 text-sm text-neutral-500">Artists and galleries to keep in touch with.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented options={SHOWING} value={showing} onChange={setShowing} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className={`${inputCls} max-w-xs`}
        />
        {tags.length > 0 && (
          <select
            value={activeTag}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Tag"
            className={`${inputCls} max-w-xs`}
          >
            <option value={ALL_TAGS}>All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm text-neutral-500">
          {shown.length} of {contacts.length}
        </span>
        <div className="ml-auto">
          <Segmented options={LAYOUTS} value={layout} onChange={setLayout} />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">
          {contacts.length === 0 ? "No contacts yet." : "No contacts match."}
        </p>
      ) : layout === "TILES" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setEditing(c)}
              className="overflow-hidden rounded-lg border border-neutral-200 text-left hover:border-neutral-400"
            >
              <Photo url={c.photoUrl} className="aspect-[4/3] w-full" />
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium text-neutral-900">{c.name}</p>
                <p className="truncate text-xs text-neutral-500">{c.town || "\u00a0"}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                {[
                  "Type",
                  "Name",
                  "Contact",
                  "Email",
                  "Website",
                  "Town",
                  "Country",
                  ...PRICE_BANDS.map((b) => b.label),
                  "Tags",
                ].map((h) => (
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
                  <td className="px-3 py-2">{c.contactPerson}</td>
                  <td className="px-3 py-2">
                    {c.email && <ContactLink href={`mailto:${c.email}`} text={c.email} />}
                  </td>
                  <td className="px-3 py-2">
                    {c.website && <ContactLink href={websiteLink(c.website)} text={c.website} newTab />}
                  </td>
                  <td className="px-3 py-2">{c.town}</td>
                  <td className="px-3 py-2">{c.country}</td>
                  {PRICE_BANDS.map((b) => (
                    <td key={b.label} className="whitespace-nowrap px-3 py-2">
                      {priceBand(c, b)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-neutral-600">{c.tags.map((t) => t.name).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ContactModal
          contact={editing === "new" ? null : editing}
          contacts={contacts}
          tags={tags}
          onSaved={setContacts}
          onDeleted={deleted}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && (
        <MarketingContactsImport
          tagNames={tags.map((t) => t.name)}
          onImported={async () => setContacts(await listMarketingContacts())}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

// A row of buttons choosing one of a few options.
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 ${value === o.value ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A contact's photo, from its link on the gallery's site — a grey panel
// when there's none or it won't load.
function Photo({ url, className }: { url: string; className: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = url && failed !== url;
  return (
    <div className={`${className} bg-neutral-100`}>
      {show && (
        // A link to another site, so not next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(url)}
          className="h-full w-full object-cover"
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
  contacts,
  tags,
  onSaved,
  onDeleted,
  onClose,
}: {
  contact: MarketingContactRow | null;
  contacts: MarketingContactRow[];
  // Every tag in use, to suggest.
  tags: { id: string; name: string }[];
  // Every contact, after each save (its links change the others too).
  onSaved: (all: MarketingContactRow[]) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<MarketingContactInput>(contact ?? EMPTY_CONTACT);
  // Its id once saved — a new one has none until it has a name.
  const [savedId, setSavedId] = useState<string | null>(contact?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const saveAs = async (id: string | null, draft: MarketingContactInput) => {
    const result = await saveMarketingContact(id, draft);
    if ("error" in result) return result;
    onSaved(result.contacts);
    return { id: result.id };
  };
  const autoSave = useAutoSave<MarketingContactInput>({
    create: (draft) => saveAs(null, draft),
    update: saveAs,
    cannotSave: (draft) => (draft.name.trim() ? null : "Give it a name to save it."),
    onSaved: setSavedId,
  });
  useEffect(() => {
    autoSave.begin(contact?.id ?? null);
    // Once, for the contact the window opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<MarketingContactInput>) => {
    const next = { ...values, ...patch };
    setValues(next);
    autoSave.schedule(next);
  };
  const close = async () => {
    await autoSave.flush();
    onClose();
  };
  const remove = () => {
    if (!savedId) return;
    startTransition(async () => {
      await autoSave.flush();
      await deleteMarketingContact(savedId);
      onDeleted(savedId);
    });
  };

  const field = (
    key: Exclude<
      keyof MarketingContactInput,
      | "type"
      | "notes"
      | "links"
      | "tags"
      | PriceBand["min"]
      | PriceBand["max"]
      | "priceCurrency"
      | "worksTypes"
    >,
    label: string,
    type = "text",
  ) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={values[key]} onChange={(e) => set({ [key]: e.target.value })} className={inputCls} />
    </div>
  );
  // A price as typed — blank is none.
  const priceField = (key: PriceBand["min"] | PriceBand["max"], label: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        min={0}
        step={1}
        value={values[key] ?? ""}
        onChange={(e) => set({ [key]: e.target.value === "" ? null : Number(e.target.value) })}
        className={inputCls}
      />
    </div>
  );
  const toggleWorks = (w: MarketingWorksType) =>
    set({
      worksTypes: values.worksTypes.includes(w)
        ? values.worksTypes.filter((x) => x !== w)
        : WORKS_TYPES.filter((x) => x === w || values.worksTypes.includes(x)),
    });

  return (
    <FormModal title={contact ? "Edit contact" : "Add contact"} busy={isPending} onClose={close}>
      <div>
        <label className={labelCls}>Type</label>
        <div className="flex gap-4 text-sm text-neutral-700">
          {(["GALLERY", "ARTIST"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2">
              {/* A gallery's artists aren't an artist's galleries, so they
                  go when the type changes. */}
              <input type="radio" checked={values.type === t} onChange={() => set({ type: t, links: [] })} />
              {TYPE_LABEL[t]}
            </label>
          ))}
        </div>
      </div>
      {field("name", "Name")}
      {PRICE_BANDS.map((b) => (
        <div key={b.label} className="grid grid-cols-2 gap-2">
          {priceField(b.min, `${b.label} from`)}
          {priceField(b.max, `${b.label} to`)}
        </div>
      ))}
      <div>
        <label className={labelCls}>Works</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700">
          {WORKS_TYPES.map((w) => (
            <label key={w} className="flex items-center gap-2">
              <input type="checkbox" checked={values.worksTypes.includes(w)} onChange={() => toggleWorks(w)} />
              {WORKS_LABEL[w]}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("email", "Email", "email")}
        {field("phone", "Phone", "tel")}
      </div>
      {field("website", "Website")}
      <div>
        {field("photoUrl", "Photo (link to an image on the gallery's site)")}
        {values.photoUrl.trim() && <Photo url={values.photoUrl.trim()} className="mt-2 aspect-[4/3] w-48 rounded-md" />}
      </div>
      {field("contactPerson", "Contact person")}
      <div className="grid grid-cols-2 gap-2">
        {field("town", "Town")}
        {field("country", "Country")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("instagram", "Instagram")}
        {field("tiktok", "TikTok")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Currency</label>
          <select
            value={values.priceCurrency ?? ""}
            onChange={(e) => set({ priceCurrency: (e.target.value || null) as MarketingCurrency | null })}
            className={inputCls}
          >
            <option value="">—</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_SIGN[c]} {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <NamesEditor
        label={LINKS_LABEL[values.type]}
        names={values.links}
        options={contacts.filter((c) => c.type === otherType(values.type))}
        onChange={(links) => set({ links })}
      />
      <NamesEditor label="Tags" names={values.tags} options={tags} onChange={(tags) => set({ tags })} />
      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={values.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={4}
          className={inputCls}
        />
      </div>
      <div className="flex min-h-9 items-center gap-2 pt-1">
        <p className={`text-xs ${autoSave.status.isError ? "text-red-600" : "text-neutral-500"}`}>
          {autoSave.status.text}
        </p>
        {savedId &&
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

// A gallery's artists, an artist's galleries, or a contact's tags: each
// with ✕ to take it off, then a box to add one — suggesting existing
// ones as you type; a name that isn't one yet is marked "new" and added
// when saved.
function NamesEditor({
  label,
  names,
  options,
  onChange,
}: {
  label: string;
  names: MarketingContactLinkRef[];
  options: { id: string; name: string; town?: string }[];
  onChange: (names: MarketingContactLinkRef[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const query = typed.trim().toLowerCase();
  const taken = (name: string, id: string | null) =>
    names.some((l) => (id && l.id === id) || l.name.toLowerCase() === name.toLowerCase());
  const suggestions = query
    ? options
        .filter((o) => o.name.toLowerCase().includes(query) && !taken(o.name, o.id))
        .slice(0, MAX_SUGGESTIONS)
    : [];

  const add = (link: MarketingContactLinkRef) => {
    if (!link.name.trim() || taken(link.name, link.id)) return setTyped("");
    onChange([...names, link]);
    setTyped("");
  };
  // What was typed: an existing one of that name, or a new one.
  const addTyped = () => {
    const name = typed.trim();
    const existing = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    add(existing ? { id: existing.id, name: existing.name } : { id: null, name });
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      {names.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {names.map((l) => (
            <span
              key={l.id ?? `new:${l.name}`}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-2.5 pr-1 text-sm text-neutral-800"
            >
              {l.name}
              {!l.id && !options.some((o) => o.name.toLowerCase() === l.name.toLowerCase()) && (
                <span className="text-xs text-neutral-500">new</span>
              )}
              <button
                type="button"
                onClick={() => onChange(names.filter((x) => x !== l))}
                aria-label={`Take off ${l.name}`}
                className="rounded-full px-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative flex gap-2">
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTyped();
            }
          }}
          placeholder={`Add ${label.toLowerCase().replace(/s$/, "")}`}
          className={inputCls}
        />
        <button type="button" onClick={addTyped} disabled={!typed.trim()} className={secondaryButtonCls}>
          Add
        </button>
        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-16 top-full z-10 mt-1 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
            {suggestions.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => add({ id: o.id, name: o.name })}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
                >
                  {o.name}
                  {o.town && <span className="ml-2 text-xs text-neutral-500">{o.town}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
