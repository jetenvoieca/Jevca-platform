"use client";

import { useState, useTransition } from "react";
import {
  saveCampaign,
  type CampaignMailSetup,
  type CampaignSummary,
} from "@/lib/actions/campaigns";
import type { MailTemplateSummary } from "@/lib/actions/mailTemplates";
import { MAX_ALTERNATIVES, campaignMailLabel, type CampaignMailKind } from "@/lib/campaignMails";
import { isBlockContentEmpty, moveMailContent } from "@/lib/mailContent";
import FormModal from "@/components/FormModal";
import {
  inputCls,
  labelCls,
  primaryButtonCls,
  secondaryButtonCls,
} from "@/components/subscriberFormParts";

// The Campaigns page's Add / Edit window (2026-10-08, Craig's choice):
// the campaign's name, and its mails — the principal mail, up to 2
// alternatives and an optional follow-up — each with the template it
// starts from. Changing an existing mail's template keeps its content
// where a component of the same kind is found; before saving, the window
// lists anything that would be lost (content with no match, or a mail
// being removed) and asks to confirm.

type Row = CampaignMailSetup & { key: string };

let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

export default function CampaignSetupModal({
  siteId,
  campaign,
  templates,
  onSaved,
  onClose,
}: {
  siteId: string;
  // The campaign being edited, or null to add one.
  campaign: CampaignSummary | null;
  templates: MailTemplateSummary[];
  onSaved: (campaign: CampaignSummary) => void;
  onClose: () => void;
}) {
  const firstTemplate = templates[0]?.id ?? null;
  const [name, setName] = useState(campaign?.name ?? "");
  const [rows, setRows] = useState<Row[]>(
    campaign
      ? campaign.mails.map((m) => ({ key: m.id, id: m.id, kind: m.kind, templateId: m.templateId }))
      : [{ key: newKey(), id: null, kind: "PRINCIPAL", templateId: firstTemplate }]
  );
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const alternatives = rows.filter((r) => r.kind === "ALTERNATIVE");
  const followUp = rows.find((r) => r.kind === "FOLLOW_UP") ?? null;

  const labelOf = (row: Row) =>
    campaignMailLabel(row.kind, row.kind === "ALTERNATIVE" ? alternatives.indexOf(row) + 1 : 0);

  // Any change means the warnings (if shown) need working out again.
  const changeRows = (change: (prev: Row[]) => Row[]) => {
    setWarnings(null);
    setRows(change);
  };

  const setTemplate = (key: string, templateId: string | null) =>
    changeRows((prev) => prev.map((r) => (r.key === key ? { ...r, templateId } : r)));

  const addMail = (kind: CampaignMailKind) =>
    changeRows((prev) => {
      const next = [...prev, { key: newKey(), id: null, kind, templateId: firstTemplate }];
      // Kept in list order: principal, alternatives, follow-up.
      const rank = (r: Row) => (r.kind === "PRINCIPAL" ? 0 : r.kind === "ALTERNATIVE" ? 1 : 2);
      return next.sort((a, b) => rank(a) - rank(b));
    });

  const removeMail = (key: string) => changeRows((prev) => prev.filter((r) => r.key !== key));

  // What saving would lose: content with no matching component in a
  // mail's new template, and mails being removed that have content.
  const losses = (): string[] => {
    if (!campaign) return [];
    const found: string[] = [];
    for (const mail of campaign.mails) {
      const row = rows.find((r) => r.id === mail.id);
      const label = campaignMailLabel(mail.kind, mail.position);
      if (!row) {
        const hasAnything = Object.values(mail.content).some((c) => !isBlockContentEmpty(c));
        if (hasAnything) found.push(`${label} will be deleted, with its content.`);
        continue;
      }
      const template = templates.find((t) => t.id === row.templateId);
      if (!template || row.templateId === mail.templateId) continue;
      const { dropped } = moveMailContent(mail.content, mail.layout, template.layout);
      if (dropped.length > 0) {
        found.push(`${label}: no place in the new template for ${dropped.join(", ")}.`);
      }
    }
    return found;
  };

  const save = () => {
    setError(null);
    setWarnings(null);
    startTransition(async () => {
      const result = await saveCampaign(siteId, campaign?.id ?? null, {
        name,
        mails: rows.map(({ id, kind, templateId }) => ({ id, kind, templateId })),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved(result.campaign);
    });
  };

  const handleSave = () => {
    const found = losses();
    if (found.length > 0) setWarnings(found);
    else save();
  };

  if (templates.length === 0 && !campaign) {
    return (
      <FormModal title="Add campaign" busy={false} onClose={onClose}>
        <p className="text-sm text-neutral-600">
          Make a mail template first, under Templates → Mail Templates.
        </p>
      </FormModal>
    );
  }

  return (
    <FormModal title={campaign ? "Edit campaign" : "Add campaign"} busy={isPending} onClose={onClose}>
      <div>
        <label className={labelCls}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={inputCls}
        />
      </div>

      <div className="space-y-2">
        <p className={labelCls}>Mails and their templates</p>
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-36 shrink-0 text-sm text-neutral-800">{labelOf(row)}</span>
            <select
              value={row.templateId ?? ""}
              onChange={(e) => setTemplate(row.key, e.target.value || null)}
              aria-label={`Template for ${labelOf(row)}`}
              className={inputCls}
            >
              {row.id && <option value="">Keep its layout as it is</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {row.kind !== "PRINCIPAL" ? (
              <button
                type="button"
                onClick={() => removeMail(row.key)}
                className="shrink-0 text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            ) : (
              <span className="w-[46px] shrink-0" />
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          {alternatives.length < MAX_ALTERNATIVES && (
            <button type="button" onClick={() => addMail("ALTERNATIVE")} className={secondaryButtonCls}>
              + Alternative mail
            </button>
          )}
          {!followUp && (
            <button type="button" onClick={() => addMail("FOLLOW_UP")} className={secondaryButtonCls}>
              + Follow-up mail
            </button>
          )}
        </div>
        {campaign && (
          <p className="text-xs text-neutral-400">
            Changing a mail&apos;s template keeps its content in components of the same kind.
          </p>
        )}
      </div>

      {warnings && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">Saving will lose some content:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={warnings ? () => setWarnings(null) : onClose}
          disabled={isPending}
          className={secondaryButtonCls}
        >
          {warnings ? "Go back" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={warnings ? save : handleSave}
          disabled={isPending || !name.trim()}
          className={primaryButtonCls}
        >
          {warnings ? "Save anyway" : campaign ? "Save" : "Add campaign"}
        </button>
      </div>
    </FormModal>
  );
}
