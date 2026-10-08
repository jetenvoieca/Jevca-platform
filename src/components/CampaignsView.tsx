"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createCampaign,
  deleteCampaign,
  describeMailPictures,
  duplicateCampaign,
  renameCampaign,
  renderCampaignMailPreview,
  updateCampaignMail,
  type CampaignMailData,
  type CampaignMailInput,
  type CampaignSummary,
  type MailPictureThumb,
} from "@/lib/actions/campaigns";
import type { MailTemplateSummary } from "@/lib/actions/mailTemplates";
import {
  cleanMailContent,
  contentOf,
  hasContent,
  MAIL_LANGUAGES,
  type BlockContent,
  type Localized,
  type MailContent,
  type MailLanguage,
} from "@/lib/mailContent";
import type { MailBlock, MailTemplateLayout } from "@/lib/mailTemplateLayout";
import MailLayoutEditor from "@/components/MailLayoutEditor";
import MailBlockContentPanel, { type PictureThumbs } from "@/components/MailBlockContentPanel";
import MailPreviewFrame from "@/components/MailPreviewFrame";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAutoSave } from "@/components/useAutoSave";

// Marketing → Mail Campaigns (2026-10-08, step 3a), laid out like Craig's
// mockup: on the left, the Preview of the finished mail (EN or FR); in
// the middle, the Components tray and the visual editor for the selected
// mail; on the right, Add / Edit / Duplicate / Delete, the Campaigns
// list, the selected campaign's mails, and the mail's subject and
// preview text. A component's Content button opens its content in the
// right-hand column. Every change shows in the Preview and saves itself
// shortly after. The audience and sending come in a later step.

type MailDraft = {
  layout: MailTemplateLayout;
  content: MailContent;
  subject: Localized<string>;
  preview: Localized<string>;
};

type CampaignForm = { mode: "add" | "edit"; name: string; templateId: string };

const PREVIEW_DELAY_MS = 400;

const MAIL_LABELS: Record<CampaignMailData["kind"], string> = { PRINCIPAL: "Principal mail" };

const LANGUAGE_NAMES: Record<MailLanguage, string> = { en: "English", fr: "French" };

const buttonClass =
  "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400";

function toDraft(mail: CampaignMailData): MailDraft {
  return { layout: mail.layout, content: mail.content, subject: mail.subject, preview: mail.preview };
}

function listButtonClass(selected: boolean): string {
  return `flex w-full items-center justify-between gap-2 truncate rounded-md border px-3 py-2 text-left text-sm ${
    selected
      ? "border-neutral-900 bg-neutral-100 text-neutral-900"
      : "border-transparent text-neutral-700 hover:bg-neutral-50"
  }`;
}

export default function CampaignsView({
  siteId,
  artistId,
  initialCampaigns,
  templates,
}: {
  siteId: string;
  artistId: string;
  initialCampaigns: CampaignSummary[];
  templates: MailTemplateSummary[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mailId, setMailId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [contentBlockId, setContentBlockId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<PictureThumbs>({});
  const [language, setLanguage] = useState<MailLanguage>("en");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;
  const mail = selected?.mails.find((m) => m.id === mailId) ?? null;

  const autoSave = useAutoSave<MailDraft>({
    update: (id, d) => updateCampaignMail(id, siteId, d),
    cannotSave: () => null,
    onSaved: () => {},
  });

  // Keeps the list's copy of the mail in step with what's being edited,
  // so switching away and back shows the latest.
  const changeDraft = (next: MailDraft) => {
    setDraft(next);
    if (mailId) {
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          mails: c.mails.map((m) => (m.id === mailId ? { ...m, ...next } : m)),
        }))
      );
      autoSave.schedule(next);
    }
  };

  // Opens a mail for editing, saving anything still waiting on the last.
  const openMail = (campaign: CampaignSummary | null, next: CampaignMailData | null) => {
    startTransition(async () => {
      await autoSave.flush();
      setSelectedId(campaign?.id ?? null);
      setMailId(next?.id ?? null);
      setDraft(next ? toDraft(next) : null);
      setContentBlockId(null);
      autoSave.begin(next?.id ?? null);
      if (next) setThumbs(await describeMailPictures(siteId, next.content));
    });
  };

  // The Preview follows every change, drawn shortly after typing stops.
  useEffect(() => {
    if (!draft) {
      setPreviewHtml(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const input: CampaignMailInput = draft;
      const result = await renderCampaignMailPreview(siteId, input, language);
      if (cancelled) return;
      if ("error" in result) {
        setPreviewError(result.error);
      } else {
        setPreviewError(null);
        setPreviewHtml(result.html);
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, language, siteId]);

  // ---- Campaigns ----

  const saveForm = () => {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      if (form.mode === "add") {
        const result = await createCampaign(siteId, { name: form.name, templateId: form.templateId });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setCampaigns((prev) => [result.campaign, ...prev]);
        setForm(null);
        openMail(result.campaign, result.campaign.mails[0] ?? null);
      } else if (selected) {
        const result = await renameCampaign(selected.id, siteId, form.name);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        const name = form.name.trim();
        setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name } : c)));
        setForm(null);
      }
    });
  };

  const handleDuplicate = () => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      await autoSave.flush();
      const result = await duplicateCampaign(selected.id, siteId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCampaigns((prev) => [result.campaign, ...prev]);
      openMail(result.campaign, result.campaign.mails[0] ?? null);
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    const id = selected.id;
    setConfirmingDelete(false);
    startTransition(async () => {
      await autoSave.flush();
      await deleteCampaign(id, siteId);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setSelectedId(null);
      setMailId(null);
      setDraft(null);
      setContentBlockId(null);
      autoSave.begin(null);
    });
  };

  // ---- The mail ----

  const changeLayout = (layout: MailTemplateLayout) => {
    if (!draft) return;
    // A removed component's content goes with it.
    changeDraft({ ...draft, layout, content: cleanMailContent(draft.content, layout) });
    if (contentBlockId && !layout.blocks.some((b) => b.id === contentBlockId)) setContentBlockId(null);
  };

  const contentBlock = draft?.layout.blocks.find((b) => b.id === contentBlockId) ?? null;

  const changeBlockContent = (blockId: string, next: BlockContent) => {
    if (!draft) return;
    changeDraft({ ...draft, content: { ...draft.content, [blockId]: next } });
  };

  const setLine = (field: "subject" | "preview", lang: MailLanguage, value: string) => {
    if (!draft) return;
    changeDraft({ ...draft, [field]: { ...draft[field], [lang]: value } });
  };

  const addThumb = (key: string, thumb: MailPictureThumb) =>
    setThumbs((prev) => ({ ...prev, [key]: thumb }));

  const blockButton = (block: MailBlock) =>
    hasContent(block.type) ? { label: "Content", onClick: () => setContentBlockId(block.id) } : null;

  const busy = !!form || isPending;

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_320px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base text-neutral-800">Preview</h2>
          <div className="flex rounded-md border border-neutral-300 p-0.5">
            {MAIL_LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLanguage(l.value)}
                className={`rounded px-2.5 py-1 text-xs ${
                  language === l.value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!draft ? (
            <p className="py-10 text-center text-sm text-neutral-400">Select a campaign to preview its mail.</p>
          ) : previewError ? (
            <p className="py-10 text-center text-sm text-red-600">{previewError}</p>
          ) : previewHtml ? (
            <MailPreviewFrame html={previewHtml} />
          ) : (
            <p className="py-10 text-center text-sm text-neutral-400">Drawing the preview…</p>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="text-center text-base text-neutral-800">
          {mail ? MAIL_LABELS[mail.kind] : "Mail"}
        </h2>
        {draft ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <MailLayoutEditor layout={draft.layout} onChange={changeLayout} blockButton={blockButton} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a campaign to edit its mail.</p>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForm({ mode: "add", name: "", templateId: templates[0]?.id ?? "" });
            }}
            disabled={busy}
            className={buttonClass}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (selected) setForm({ mode: "edit", name: selected.name, templateId: "" });
            }}
            disabled={busy || !selected}
            className={buttonClass}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={busy || !selected}
            className={buttonClass}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy || !selected}
            className={`${buttonClass} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
          >
            Delete
          </button>
        </div>

        {draft && contentBlock && hasContent(contentBlock.type) ? (
          <MailBlockContentPanel
            key={contentBlock.id}
            blockId={contentBlock.id}
            content={contentOf(draft.content, contentBlock as MailBlock & { type: BlockContent["type"] })}
            onChange={(next) => changeBlockContent(contentBlock.id, next)}
            artistId={artistId}
            siteId={siteId}
            thumbs={thumbs}
            onThumb={addThumb}
            onClose={() => setContentBlockId(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <div className="flex min-h-[10rem] flex-col rounded-lg border border-neutral-300 bg-white p-3">
              <h2 className="mb-3 text-center text-base text-neutral-800">Campaigns</h2>

              {form && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveForm();
                  }}
                  className="mb-3 space-y-2 rounded-md bg-neutral-50 p-2"
                >
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Campaign name"
                    aria-label="Campaign name"
                    autoFocus
                    className={inputClass}
                  />
                  {form.mode === "add" &&
                    (templates.length > 0 ? (
                      <select
                        value={form.templateId}
                        onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                        aria-label="Mail template"
                        className={inputClass}
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        Make a mail template first, under Templates → Mail Templates.
                      </p>
                    ))}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        isPending || !form.name.trim() || (form.mode === "add" && !form.templateId)
                      }
                      className="flex-1 rounded-md bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                    >
                      {form.mode === "add" ? "Add campaign" : "Save name"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(null);
                        setError(null);
                      }}
                      className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

              <div className="flex flex-col gap-1">
                {campaigns.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      c.id === selectedId ? openMail(null, null) : openMail(c, c.mails[0] ?? null)
                    }
                    className={listButtonClass(c.id === selectedId)}
                  >
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
                {campaigns.length === 0 && (
                  <p className="py-4 text-center text-xs text-neutral-400">
                    No campaigns yet. Use Add to create one.
                  </p>
                )}
              </div>
            </div>

            {selected && draft && (
              <div className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-3">
                <div className="flex flex-col gap-1">
                  {selected.mails.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => m.id !== mailId && openMail(selected, m)}
                      className={listButtonClass(m.id === mailId)}
                    >
                      <span className="truncate">{MAIL_LABELS[m.kind]}</span>
                    </button>
                  ))}
                </div>

                {MAIL_LANGUAGES.map(({ value: lang }) => (
                  <div key={lang} className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {LANGUAGE_NAMES[lang]}
                    </p>
                    <input
                      type="text"
                      value={draft.subject[lang]}
                      onChange={(e) => setLine("subject", lang, e.target.value)}
                      placeholder="Subject"
                      aria-label={`Subject in ${LANGUAGE_NAMES[lang]}`}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={draft.preview[lang]}
                      onChange={(e) => setLine("preview", lang, e.target.value)}
                      placeholder="Preview text (shown after the subject)"
                      aria-label={`Preview text in ${LANGUAGE_NAMES[lang]}`}
                      className={inputClass}
                    />
                  </div>
                ))}
                <p className="text-xs text-neutral-400">
                  With no French subject, French subscribers don&apos;t get this campaign.
                </p>
                <p className={`text-xs ${autoSave.status.isError ? "text-red-600" : "text-neutral-500"}`}>
                  {autoSave.status.text}
                </p>
              </div>
            )}
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={confirmingDelete && !!selected}
        title="Delete this campaign?"
        message={`"${selected?.name ?? ""}" and its mails will be deleted. This can't be undone.`}
        confirmLabel="Delete campaign"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
