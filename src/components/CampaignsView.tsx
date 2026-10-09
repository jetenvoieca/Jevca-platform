"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteCampaign,
  describeMailPictures,
  duplicateCampaign,
  getCampaign,
  renderCampaignMailPreview,
  setAlternativeShare,
  setFollowUp,
  updateCampaignMail,
  type CampaignMailData,
  type CampaignMailInput,
  type CampaignSummary,
  type MailPictureThumb,
} from "@/lib/actions/campaigns";
import type { MailTemplateSummary } from "@/lib/actions/mailTemplates";
import type { MailListSummary } from "@/lib/actions/subscribers";
import { translateMailToFrench } from "@/lib/actions/translateMail";
import { applyFrench, frenchGaps, hasNoFrench } from "@/lib/mailTranslation";
import { campaignMailLabel, type FollowUpCondition } from "@/lib/campaignMails";
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
import MailLayoutEditor, { MailBlockShape } from "@/components/MailLayoutEditor";
import MailBlockContent, { ButtonSettings, type PictureThumbs } from "@/components/MailBlockContent";
import MailPreviewFrame from "@/components/MailPreviewFrame";
import CampaignSetupModal from "@/components/CampaignSetupModal";
import CampaignMailList from "@/components/CampaignMailList";
import CampaignAudience from "@/components/CampaignAudience";
import CampaignResults from "@/components/CampaignResults";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAutoSave } from "@/components/useAutoSave";

// Marketing → Mail Campaigns (2026-10-08, step 3a; reworked the same day
// from Craig's annotated mockup), laid out like it: on the left, the
// Preview of the finished mail; in the middle, the selected mail (with
// "+ Add component" above it) — its template's layout as a form, with each
// component's content typed straight into it, and the EN | FR switch
// (which language is typed, and previewed) above it with the subject and
// preview text — in French, "Translate now" fills whatever has English
// but no French yet; on the right, Add / Edit / Duplicate / Delete (Add and
// Edit open the campaign's window: its name, and its mails with their
// templates), the Campaigns list, and the selected campaign's mails
// with their shares and the follow-up's condition, then the Audience
// box (lists, Test message, Send). Every change shows in the Preview and
// saves itself shortly after. Once a campaign has started sending, the
// middle column opens on its Results (step 4b), with a Results | Mail
// switch; picking one of its mails shows that mail.

type MailDraft = {
  layout: MailTemplateLayout;
  content: MailContent;
  subject: Localized<string>;
  preview: Localized<string>;
};

const PREVIEW_DELAY_MS = 400;

const buttonClass =
  "rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400";

function toDraft(mail: CampaignMailData): MailDraft {
  return { layout: mail.layout, content: mail.content, subject: mail.subject, preview: mail.preview };
}

// Which window is open: Add (null) or Edit (the campaign).
type SetupWindow = { campaign: CampaignSummary | null };

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
  artistEmail,
  initialCampaigns,
  templates,
  lists,
}: {
  siteId: string;
  artistId: string;
  artistEmail: string | null;
  initialCampaigns: CampaignSummary[];
  templates: MailTemplateSummary[];
  lists: MailListSummary[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mailId, setMailId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [thumbs, setThumbs] = useState<PictureThumbs>({});
  const [language, setLanguage] = useState<MailLanguage>("en");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupWindow | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  // Goes up when a translation replaces the content, so the text boxes
  // show it.
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // For a campaign that has started sending: its mail instead of Results.
  const [showMail, setShowMail] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;
  const mail = selected?.mails.find((m) => m.id === mailId) ?? null;

  // The draft as it is now — the translation, which takes a few seconds,
  // is put into whatever has been typed meanwhile.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const mailIdRef = useRef(mailId);
  mailIdRef.current = mailId;

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
      // Another campaign opens on its Results; another of its mails, on
      // that mail.
      setShowMail(!!campaign && campaign.id === selectedId);
      setSelectedId(campaign?.id ?? null);
      setMailId(next?.id ?? null);
      setDraft(next ? toDraft(next) : null);
      setTranslateError(null);
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

  // Add / Edit: anything still being typed is saved first, so the window
  // works from the latest content.
  const openSetup = (campaign: CampaignSummary | null) => {
    setError(null);
    startTransition(async () => {
      await autoSave.flush();
      setSetup({ campaign });
    });
  };

  // After Add / Edit: the saved campaign replaces (or joins) the list,
  // and the mail being edited stays open if it's still there.
  const handleSetupSaved = (saved: CampaignSummary) => {
    const isNew = !campaigns.some((c) => c.id === saved.id);
    setCampaigns((prev) => (isNew ? [saved, ...prev] : prev.map((c) => (c.id === saved.id ? saved : c))));
    setSetup(null);
    const keep = saved.mails.find((m) => m.id === mailId);
    openMail(saved, keep ?? saved.mails[0] ?? null);
  };

  // Changes one mail's settings in the list straight away, then saves
  // them; if saving is refused, the list goes back and says why.
  const changeMailSettings = (
    mailId: string,
    patch: Partial<CampaignMailData>,
    save: () => Promise<{ ok: true } | { error: string }>
  ) => {
    const before = campaigns;
    setError(null);
    setCampaigns((prev) =>
      prev.map((c) => ({
        ...c,
        mails: c.mails.map((m) => (m.id === mailId ? { ...m, ...patch } : m)),
      }))
    );
    startTransition(async () => {
      const result = await save();
      if ("error" in result) {
        setCampaigns(before);
        setError(result.error);
      }
    });
  };

  const handleShare = (id: string, percent: number) =>
    changeMailSettings(id, { sharePercent: percent }, () => setAlternativeShare(id, siteId, percent));

  const handleFollowUp = (id: string, followUp: { condition: FollowUpCondition; days: number }) =>
    changeMailSettings(id, { followUp }, () => setFollowUp(id, siteId, followUp));

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
    setError(null);
    startTransition(async () => {
      await autoSave.flush();
      const result = await deleteCampaign(id, siteId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setSelectedId(null);
      setMailId(null);
      setDraft(null);
      autoSave.begin(null);
    });
  };

  // ---- The mail ----

  const changeLayout = (layout: MailTemplateLayout) => {
    if (!draft) return;
    // A removed component's content goes with it.
    changeDraft({ ...draft, layout, content: cleanMailContent(draft.content, layout) });
  };

  const changeBlockContent = (blockId: string, next: BlockContent) => {
    if (!draft) return;
    changeDraft({ ...draft, content: { ...draft.content, [blockId]: next } });
  };

  const setLine = (field: "subject" | "preview", value: string) => {
    if (!draft) return;
    changeDraft({ ...draft, [field]: { ...draft[field], [language]: value } });
  };

  const addThumb = (key: string, thumb: MailPictureThumb) =>
    setThumbs((prev) => ({ ...prev, [key]: thumb }));

  const pickers = { artistId, siteId, thumbs, onThumb: addThumb };

  // A component with content is filled in place; the Logo and Signature
  // come from Settings, so they show their outline.
  const renderBlock = (block: MailBlock) => {
    if (!draft) return null;
    if (!hasContent(block.type)) return <MailBlockShape block={block} layout={draft.layout} />;
    return (
      <MailBlockContent
        blockId={block.id}
        content={contentOf(draft.content, block as MailBlock & { type: BlockContent["type"] })}
        language={language}
        revision={revision}
        onChange={(next) => changeBlockContent(block.id, next)}
        pickers={pickers}
      />
    );
  };

  // A Button's link and colours, from its bar.
  const settingsPanel = (block: MailBlock) => {
    if (!draft || block.type !== "button") return null;
    const content = contentOf(draft.content, block as MailBlock & { type: "button" });
    return {
      button: "Link & colours",
      title: "Button",
      content: (
        <ButtonSettings
          key={block.id}
          content={content}
          onChange={(next) => changeBlockContent(block.id, next)}
        />
      ),
    };
  };

  // Translate now: the French of every part that has English but no
  // French yet, from the artist's own voice (Settings → Writing voice).
  const handleTranslate = async () => {
    if (!draft) return;
    const translatingMailId = mailId;
    setTranslating(true);
    setTranslateError(null);
    const result = await translateMailToFrench(siteId, draft);
    setTranslating(false);
    if ("error" in result) {
      setTranslateError(result.error);
      return;
    }
    const current = latestDraft.current;
    if (current && translatingMailId === mailIdRef.current) {
      changeDraft(applyFrench(current, result.fill));
      setRevision((n) => n + 1);
    }
  };

  // A campaign's sending status changed (lists, Send, Cancel, or how
  // sending is going): only those parts are taken — the mails as being
  // edited here stay as they are.
  const updateSending = (next: CampaignSummary) =>
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === next.id
          ? {
              ...c,
              status: next.status,
              scheduledAt: next.scheduledAt,
              sentAt: next.sentAt,
              sendError: next.sendError,
              listIds: next.listIds,
              progress: next.progress,
            }
          : c
      )
    );

  // While the selected campaign is waiting to start or sending, its
  // status is checked every 10 seconds.
  const watchedId =
    selected && (selected.status === "SCHEDULED" || selected.status === "SENDING") ? selected.id : null;
  useEffect(() => {
    if (!watchedId) return;
    const timer = setInterval(async () => {
      const latest = await getCampaign(watchedId, siteId);
      if (latest) updateSending(latest);
    }, 10_000);
    return () => clearInterval(timer);
  }, [watchedId, siteId]);

  // Once sending starts, the principal and alternative mails can't be
  // changed (the follow-up can, until it goes).
  const started = !!selected && (selected.status === "SENDING" || selected.status === "SENT");
  const mailLocked = mail?.kind === "FOLLOW_UP" ? !!mail.followUpSending?.startedAt : started;

  const busy = !!setup || isPending;

  return (
    <div className="grid h-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_300px] gap-4 p-4">
      <section className="flex min-h-0 flex-col rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="mb-3 text-center text-base text-neutral-800">Preview</h2>
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
        {selected && started && (
          <div className="mb-3 flex justify-center">
            <div className="flex rounded-md border border-neutral-300 p-0.5">
              {[
                { label: "Results", mail: false },
                { label: "Mail", mail: true },
              ].map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setShowMail(tab.mail)}
                  className={`rounded px-3 py-1 text-sm ${
                    showMail === tab.mail ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {selected && started && !showMail ? (
          <CampaignResults
            siteId={siteId}
            campaignId={selected.id}
            campaignName={selected.name}
            sending={selected.status === "SENDING"}
          />
        ) : draft && mail ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base text-neutral-800">{campaignMailLabel(mail.kind, mail.position)}</h2>
              <div className="flex rounded-md border border-neutral-300 p-0.5">
                {MAIL_LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLanguage(l.value)}
                    className={`rounded px-3 py-1 text-sm ${
                      language === l.value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            {mailLocked ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="max-w-sm text-center text-sm text-neutral-500">
                  This mail has been sent, so it can&apos;t be changed — the Preview shows it as sent. Duplicate
                  the campaign to send something similar.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={draft.subject[language]}
                    onChange={(e) => setLine("subject", e.target.value)}
                    placeholder="Subject"
                    aria-label="Subject"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={draft.preview[language]}
                    onChange={(e) => setLine("preview", e.target.value)}
                    placeholder="Preview text (shown after the subject)"
                    aria-label="Preview text"
                    className={inputClass}
                  />
                </div>
                {language === "fr" && frenchGaps(draft).length > 0 && (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                    <p className="text-sm text-neutral-700">
                      {hasNoFrench(draft)
                        ? "No French version yet — translate from the English, or type it directly below."
                        : "Some parts have no French yet — translate them from the English, or type them below."}
                    </p>
                    <button
                      type="button"
                      onClick={handleTranslate}
                      disabled={translating}
                      className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {translating ? "Translating…" : "Translate now"}
                    </button>
                  </div>
                )}
                {language === "fr" && translateError && (
                  <p className="mb-3 text-xs text-red-600">{translateError}</p>
                )}
                {language === "fr" && !draft.subject.fr.trim() && (
                  <p className="mb-3 text-xs text-neutral-500">
                    With no French subject, French subscribers don&apos;t get this campaign.
                  </p>
                )}
                <div className="flex min-h-0 flex-1 flex-col">
                  <MailLayoutEditor
                    layout={draft.layout}
                    onChange={changeLayout}
                    renderBlock={renderBlock}
                    settingsPanel={settingsPanel}
                    fluid
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a campaign to edit its mail.</p>
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => openSetup(null)}
            disabled={busy}
            className={buttonClass}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => selected && openSetup(selected)}
            disabled={busy || !selected || started}
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
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex min-h-[10rem] flex-col rounded-lg border border-neutral-300 bg-white p-3">
          <h2 className="mb-3 text-center text-base text-neutral-800">Campaigns</h2>

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
                <StatusTag campaign={c} />
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
          <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
            <CampaignMailList
              mails={selected.mails}
              selectedId={mailId}
              onSelect={(m) => openMail(selected, m)}
              onShare={handleShare}
              onFollowUp={handleFollowUp}
            />
            <p className={`text-xs ${autoSave.status.isError ? "text-red-600" : "text-neutral-500"}`}>
              {autoSave.status.text}
            </p>
          </div>
        )}

        {selected && draft && (
          <CampaignAudience
            siteId={siteId}
            artistEmail={artistEmail}
            campaign={selected}
            lists={lists}
            mail={draft}
            beforeSend={() => autoSave.flush()}
            onCampaign={updateSending}
          />
        )}
      </aside>

      {setup && (
        <CampaignSetupModal
          siteId={siteId}
          campaign={setup.campaign}
          templates={templates}
          onSaved={handleSetupSaved}
          onClose={() => setSetup(null)}
        />
      )}

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

// A campaign's sending status beside its name in the list.
function StatusTag({ campaign }: { campaign: CampaignSummary }) {
  if (campaign.status === "DRAFT") return null;
  const label = {
    SCHEDULED: "Scheduled",
    SENDING: "Sending",
    SENT: "Sent",
  }[campaign.status];
  const colour =
    campaign.status === "SENT"
      ? "bg-green-50 text-green-700"
      : campaign.status === "SENDING"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${colour}`}>{label}</span>;
}
