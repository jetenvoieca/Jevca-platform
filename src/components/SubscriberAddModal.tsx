"use client";

import { useState, useTransition } from "react";
import {
  addSubscriber,
  type MailListSummary,
  type SubscriberLanguage,
  type SubscriberRow,
} from "@/lib/actions/subscribers";
import {
  ConsentCheckbox,
  LanguageSelect,
  inputCls,
  labelCls,
  primaryButtonCls,
} from "@/components/subscriberFormParts";
import FormModal from "@/components/FormModal";

// Marketing → Subscribers → Add subscriber (2026-10-08). Starts in the
// mail list being viewed, if any.
export default function SubscriberAddModal({
  artistId,
  artistName,
  lists,
  initialListId,
  onAdded,
  onClose,
}: {
  artistId: string;
  artistName: string;
  lists: MailListSummary[];
  initialListId: string | null;
  onAdded: (row: SubscriberRow) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [language, setLanguage] = useState<SubscriberLanguage | null>(null);
  const [listIds, setListIds] = useState<string[]>(initialListId ? [initialListId] : []);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleList = (id: string) =>
    setListIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleAdd = () => {
    setError(null);
    startTransition(async () => {
      const result = await addSubscriber(artistId, {
        email,
        firstName,
        lastName,
        language,
        listIds,
        consent,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onAdded(result);
    });
  };

  return (
    <FormModal title="Add subscriber" busy={isPending} onClose={onClose}>
      <div>
        <label className={labelCls}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>First name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Last name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Language</label>
        <LanguageSelect value={language} onChange={setLanguage} />
      </div>
      {lists.length > 0 && (
        <div>
          <label className={labelCls}>Mail lists</label>
          <div className="space-y-1">
            {lists.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={listIds.includes(l.id)}
                  onChange={() => toggleList(l.id)}
                />
                {l.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <ConsentCheckbox
        artistName={artistName}
        plural={false}
        checked={consent}
        onChange={setConsent}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleAdd}
        disabled={isPending || !email.trim() || !consent}
        className={primaryButtonCls}
      >
        {isPending ? "Adding…" : "Add subscriber"}
      </button>
    </FormModal>
  );
}
