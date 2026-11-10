"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateArtistContact,
  updateArtistProfileText,
  type ArtistContactField,
  type ArtistProfileTextField,
} from "@/lib/actions";
import { setSiteAddOns } from "@/lib/actions/plans";
import type { ArtistAppPage } from "@/lib/actions/artistApp";
import { priceAddOns, type SiteAccount, type SiteAddOnChoice, type SiteAddOnRow } from "@/lib/plans";
import { formatMoney } from "@/lib/currencies";
import { artistAppPageHref } from "@/lib/artistApp";
import PlanAddOnsList from "@/components/PlanAddOnsList";
import { MainPanel, SidePanel } from "@/components/artist-app/ArtistAppPanels";

// The Artist App's Account (2026-11-10, Craig's mockup). On the left the
// plan and what it includes (Administration → Plans), and the client's Contact
// Details, each saved when its box is left; on the right the plan — what
// the site pays for it, theme and pages included, fixed — and its add-ons
// to tick (those it has at the prices it took them at), kept with Update (the app then follows
// them — see ArtistAppFeatures). Beside them the site's pages, each
// opening it on Pages. Payments (dates, pause, cancel) come with Stripe.

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  tiktokHandle: string | null;
};

const BOX = "rounded-lg border border-neutral-300 p-5";

export default function ArtistAccountView({
  siteId,
  account,
  contact,
  pages,
}: {
  siteId: string;
  account: SiteAccount;
  contact: Contact;
  // Arranged (arrangePages).
  pages: ArtistAppPage[];
}) {
  const { plan } = account;
  return (
    <>
      <MainPanel heading="Account">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <section className={BOX}>
              <h3 className="mb-3 text-lg text-neutral-800">Plan : {plan?.name ?? "none yet"}</h3>
              {plan && plan.included.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-12 text-base text-neutral-800">
                  {plan.included.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
            <ContactDetails contact={contact} />
          </div>
          <div>
            {plan ? (
              <PlanChoice siteId={siteId} plan={plan} initial={account.addOns} />
            ) : (
              <p className={`${BOX} text-sm text-neutral-500`}>Your site doesn&apos;t have a plan yet.</p>
            )}
          </div>
        </div>
      </MainPanel>
      <SidePanel>
        <PageLinks siteId={siteId} pages={pages} />
      </SidePanel>
    </>
  );
}

// The plan, fixed, and its add-ons to tick — kept with Update.
function PlanChoice({
  siteId,
  plan,
  initial,
}: {
  siteId: string;
  plan: NonNullable<SiteAccount["plan"]>;
  initial: SiteAddOnRow[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [addOns, setAddOns] = useState<SiteAddOnChoice[]>(initial);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const choicesOf = (rows: SiteAddOnChoice[]) => JSON.stringify(rows.map((r) => [r.addOn, r.quantity]));
  const changed = choicesOf(addOns) !== choicesOf(saved);

  const update = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await setSiteAddOns(siteId, addOns).catch(() => ({ error: "That wasn't saved — please try again." }));
      if ("error" in result) return setMessage({ error: true, text: result.error });
      setSaved(priceAddOns(addOns, saved, plan.addOns));
      setMessage({ error: false, text: "Updated" });
      // What the app offers follows the add-ons.
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className={`${BOX} flex flex-col gap-3 text-sm text-neutral-800`}>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Plan</p>
        <p className="rounded-md border border-neutral-300 px-3 py-1.5">
          {plan.name} — {formatMoney(plan.monthlyPrice, plan.currency, "when-any")} a month
        </p>
        {plan.themeName && (
          <p className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-neutral-500">Theme</span>
            {plan.themeName}
          </p>
        )}
        <p className="text-xs text-neutral-500">
          {plan.groupsIncluded} group{plan.groupsIncluded === 1 ? "" : "s"} of up to {plan.pagesPerGroup} pages included.
        </p>
        <PlanAddOnsList
          plan={plan}
          planPrice={plan.monthlyPrice}
          kept={saved}
          value={addOns}
          onChange={(next) => {
            setAddOns(next);
            setMessage(null);
          }}
          disabled={isPending}
        />
      </section>
      <div className="flex items-center justify-end gap-3">
        {message && <p className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>{message.text}</p>}
        <button
          type="button"
          onClick={update}
          disabled={!changed || isPending}
          className="border border-neutral-400 px-10 py-1.5 text-lg text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
        >
          {isPending ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}

// The client's contact details, each saved when its box is left.
function ContactDetails({ contact }: { contact: Contact }) {
  const [error, setError] = useState<string | null>(null);

  const saveContact = async (field: ArtistContactField, value: string, was: string | null) => {
    if (value.trim() === (was ?? "")) return;
    setError(null);
    const result = await updateArtistContact(contact.id, field, value).catch(() => ({
      error: "That wasn't saved — please try again.",
    }));
    if ("error" in result) setError(result.error);
  };
  const saveText = async (field: ArtistProfileTextField, value: string, was: string | null) => {
    if (value.trim() === (was ?? "")) return;
    setError(null);
    await updateArtistProfileText(contact.id, field, value).catch(() => setError("That wasn't saved — please try again."));
  };

  const row = (label: string, defaultValue: string | null, onSave: (value: string) => void, type = "text") => (
    <label className="grid grid-cols-[110px_1fr] items-center gap-3">
      <span className="text-base text-neutral-800">{label}</span>
      <input
        type={type}
        defaultValue={defaultValue ?? ""}
        onBlur={(e) => onSave(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="min-w-0 border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
      />
    </label>
  );

  return (
    <section className={`${BOX} flex flex-col gap-3`}>
      <h3 className="mb-1 text-lg text-neutral-800">Contact Details</h3>
      {row("Artist Name", contact.name, (v) => saveContact("name", v, contact.name))}
      {row("Email", contact.email, (v) => saveContact("email", v, contact.email), "email")}
      {row("Phone", contact.phone, (v) => saveContact("phone", v, contact.phone), "tel")}
      {row("Instagram", contact.instagramHandle, (v) => saveText("instagramHandle", v, contact.instagramHandle))}
      {row("Facebook", contact.facebookUrl, (v) => saveText("facebookUrl", v, contact.facebookUrl))}
      {row("TikTok", contact.tiktokHandle, (v) => saveText("tiktokHandle", v, contact.tiktokHandle))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

// The site's Live and Hidden pages, as on Pages; each opens it there.
function PageLinks({ siteId, pages }: { siteId: string; pages: ArtistAppPage[] }) {
  const titleOf = (id: string) => pages.find((p) => p.id === id)?.title ?? "";
  return (
    <>
      {[true, false].map((visible) => {
        const listed = pages.filter((p) => p.visible === visible);
        return (
          <div key={String(visible)} className="flex flex-col gap-1.5 pt-5 pb-8">
            <h3 className="mb-2 text-center text-lg text-neutral-800">{visible ? "Live Pages" : "Hidden Pages"}</h3>
            {listed.map((p) => {
              const parentHere = !!p.parentId && listed.some((q) => q.id === p.parentId);
              return (
                <Link
                  key={p.id}
                  href={artistAppPageHref(siteId, p.id)}
                  prefetch={false}
                  className={`flex items-baseline justify-between gap-2 rounded-sm border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50 ${
                    p.parentId ? "ml-6" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">{p.title}</span>
                  {p.parentId && !parentHere && (
                    <span className="shrink-0 text-xs text-neutral-400">under {titleOf(p.parentId)}</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
