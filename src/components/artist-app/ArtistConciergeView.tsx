"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MainPanel } from "@/components/artist-app/ArtistAppPanels";
import ArtistNewWorkModal from "@/components/artist-app/ArtistNewWorkModal";
import { useClientWords } from "@/components/ClientWordsProvider";
import { finalizeUpload, requestUploadUrl } from "@/lib/actions/media";
import { sendConciergeRequest } from "@/lib/actions/concierge";
import {
  CONCIERGE_KINDS,
  CONCIERGE_MAX_LENGTH,
  CONCIERGE_PROFILE_KINDS,
  isConciergeProfileKind,
  type ConciergeKind,
  type ConciergeProfileKind,
  type ConciergeRequest,
} from "@/lib/concierge";
import { formatDateTime } from "@/lib/formatDate";

// The Concierge (2026-11-13, Craig's mockup): the kinds of request on the
// left; the one chosen on the right, its title, "Just say what's needed"
// and Send — sent to the client's Hopper (sendConciergeRequest). Only "Add
// / edit an Artwork" takes a picture (one), and also opens the new work
// form (the Catalogue only). The Artist statement, Biography and list of
// Galleries start from the entry as it is (CONCIERGE_PROFILE_KINDS),
// edited and sent to be checked before it goes on the website. "Rearrange artworks on a page" has "On which page?" beside the
// text — the page chosen (optional) is where Administration → Concierge
// opens. Under them, the requests sent and whether each is done.
export default function ArtistConciergeView({
  siteId,
  artistId,
  requests,
  profileTexts,
  workPages,
}: {
  siteId: string;
  artistId: string;
  requests: ConciergeRequest[];
  // The Artist Statement, Biography and Galleries as they are now.
  profileTexts: Record<ConciergeProfileKind, string>;
  // The pages a rearrange request can name (listConciergeWorkPages).
  workPages: { id: string; title: string }[];
}) {
  const router = useRouter();
  const words = useClientWords();
  const [kind, setKind] = useState<ConciergeKind>(CONCIERGE_KINDS[0].key);
  const [text, setText] = useState("");
  const [pageId, setPageId] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ id: string; preview: string } | null>(null);
  const [busy, setBusy] = useState<"upload" | "send" | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [newWork, setNewWork] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const label = CONCIERGE_KINDS.find((k) => k.key === kind)!.label;

  // One picture, uploaded to the Hopper (to be sorted there too).
  const addPicture = async (file: File) => {
    if (!file.type.startsWith("image/")) return setMessage({ error: true, text: "Choose a picture." });
    setBusy("upload");
    setMessage(null);
    try {
      const target = await requestUploadUrl(artistId, file.name, file.type);
      if ("error" in target) throw new Error(target.error);
      const put = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      const { image } = await finalizeUpload(artistId, target.key, file.type, "PHOTO", {
        status: "HOPPER",
        source: "Concierge",
        rejectUnreadable: true,
      });
      setPicture({ id: image.id, preview: URL.createObjectURL(file) });
    } catch (err) {
      setMessage({ error: true, text: err instanceof Error && err.message ? err.message : "The picture wasn't added." });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    setMessage(null);
    const result = await sendConciergeRequest(siteId, {
      kind,
      text,
      imageId: picture?.id ?? null,
      pageId: kind === "rearrange" ? pageId : null,
    }).catch(() => ({
      error: "That wasn't sent — please try again.",
    }));
    setBusy(null);
    if ("error" in result) return setMessage({ error: true, text: result.error });
    setText("");
    setPicture(null);
    setPageId(null);
    setMessage({ error: false, text: "Sent — we'll take care of it." });
    router.refresh();
  };

  const choose = (next: ConciergeKind) => {
    setKind(next);
    setMessage(null);
    setText(isConciergeProfileKind(next) ? profileTexts[next] : "");
    if (next !== "artwork") setPicture(null);
    setPageId(null);
  };
  // A Profile entry must be changed before it's sent.
  const profile = isConciergeProfileKind(kind) ? CONCIERGE_PROFILE_KINDS[kind] : null;
  const unchanged = isConciergeProfileKind(kind) && text.trim() === profileTexts[kind].trim();

  const button = "border border-neutral-300 px-5 py-2 text-base font-light text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <MainPanel heading="Concierge Service">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <nav className="flex flex-col gap-2 lg:pt-9">
          {CONCIERGE_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => choose(k.key)}
              aria-current={k.key === kind ? "true" : undefined}
              className={`border px-6 py-1.5 text-left text-base font-light text-neutral-800 hover:bg-neutral-50 ${
                k.key === kind ? "border-neutral-800" : "border-neutral-300"
              }`}
            >
              {k.label}
            </button>
          ))}
        </nav>

        <section className="flex min-h-96 flex-col gap-4 rounded-lg border border-neutral-300 p-5">
          <h3 className="text-center text-2xl font-light text-neutral-800">{label}</h3>
          <div className={kind === "rearrange" ? "grid flex-1 gap-6 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "flex flex-1 flex-col"}>
            <textarea
              id="concierge-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={CONCIERGE_MAX_LENGTH}
              placeholder={profile?.placeholder ?? "Just say what's needed"}
              aria-label={profile?.placeholder ?? "What's needed"}
              className={`min-h-48 flex-1 resize-y p-1 font-light text-neutral-800 outline-none placeholder:text-neutral-500 ${
                profile ? "text-base" : "text-xl"
              }`}
            />
            {kind === "rearrange" && workPages.length > 0 && (
              <div>
                <p className="mb-3 text-xl font-light text-neutral-800">On which page?</p>
                <div className="flex flex-col border border-neutral-300 p-1">
                  {workPages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPageId(p.id === pageId ? null : p.id)}
                      aria-pressed={p.id === pageId}
                      className={`px-2 py-1 text-left text-base ${
                        p.id === pageId ? "bg-neutral-900 text-white" : "text-neutral-800 hover:bg-neutral-50"
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {picture && (
            <div className="flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture.preview} alt="" className="h-24 w-24 border border-neutral-200 object-cover" />
              <button type="button" onClick={() => setPicture(null)} className="text-sm text-neutral-500 hover:text-neutral-800">
                Remove picture
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {message && (
              <p className={`mr-auto text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
            )}
            {kind === "artwork" && (
              <>
                <button type="button" onClick={() => setNewWork(true)} className={button}>
                  Add {words.item.toLowerCase()} myself
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null} className={button}>
                  {busy === "upload" ? "Adding…" : picture ? "Change image" : "Add an image"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={send}
              disabled={busy !== null || !text.trim() || unchanged}
              className="bg-neutral-900 px-6 py-2 text-base text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {busy === "send" ? "Sending…" : "Send"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) addPicture(file);
              }}
            />
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h3 className="mb-3 text-lg text-neutral-800">Your requests</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing sent yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-200 border-y border-neutral-200">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start gap-4 py-3">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" className="h-12 w-12 shrink-0 object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-500">
                    {formatDateTime(r.createdAt)} · {r.kind}
                  </p>
                  <p className="line-clamp-2 whitespace-pre-wrap text-base text-neutral-800">{r.text}</p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                    r.done ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {r.done ? "Done" : "With us"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {newWork && (
        <ArtistNewWorkModal
          siteId={siteId}
          artistId={artistId}
          curationId={null}
          onClose={() => setNewWork(false)}
          onAdded={() => {
            setNewWork(false);
            setMessage({ error: false, text: `${words.item} added to your catalogue.` });
          }}
        />
      )}
    </MainPanel>
  );
}
