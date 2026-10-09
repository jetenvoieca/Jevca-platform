"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import {
  getCampaignPeople,
  getCampaignResults,
  type CampaignResults as Results,
  type FollowUpResults,
} from "@/lib/actions/campaignResults";
import {
  VERSION_COLOURS,
  formatPercent,
  leadingVersion,
  versionRates,
  type PeopleList,
  type ResultPerson,
  type VersionCounts,
} from "@/lib/campaignResults";
import { formatParisDate, formatParisDateTime } from "@/lib/parisTime";

// A sent campaign's Results (2026-10-09, Marketing step 4b), from Craig's
// mockup: the campaign's name and send date; a bar each for Delivered,
// Opened and Clicked, stacked by version with the count in each part and
// the total below; then a row per version with its colour, Open, Click
// and Conversion. Below that, the people who clicked and those who
// opened but didn't click, by version, with a CSV download. The
// follow-up (step 4c) has its own row under the versions once it has
// gone.

type Stage = { key: "delivered" | "opened" | "clicked"; label: string };
const STAGES: Stage[] = [
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
];

// The Delivered bar's height; the others are in proportion, except that
// every part is at least tall enough to show its number (as in the
// mockup).
const BAR_HEIGHT = 240;
const PART_MIN_HEIGHT = 22;
const PAGE = 100;

const boxClass = "flex items-center rounded-md border border-neutral-300 text-sm";
const toolButtonClass =
  "rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

export default function CampaignResults({
  siteId,
  campaignId,
  campaignName,
  sending,
}: {
  siteId: string;
  campaignId: string;
  campaignName: string;
  sending: boolean;
}) {
  const [results, setResults] = useState<Results | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setResults(await getCampaignResults(campaignId, siteId));
    });
  }, [campaignId, siteId]);

  useEffect(() => {
    setResults(null);
    load();
  }, [load]);

  if (!results) {
    return <p className="py-10 text-center text-sm text-neutral-400">Loading results…</p>;
  }

  const versions = results.versions;
  const totals = versions.reduce(
    (t, v) => ({
      sent: t.sent + v.sent,
      delivered: t.delivered + v.delivered,
      opened: t.opened + v.opened,
      clicked: t.clicked + v.clicked,
      bounced: t.bounced + v.bounced,
      complained: t.complained + v.complained,
    }),
    { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
  );
  const colourOf = (mailId: string) => VERSION_COLOURS[versions.findIndex((v) => v.mailId === mailId)] ?? "#999";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div className="text-center">
        <h2 className="text-base text-neutral-800">
          {campaignName}
          {results.sentAt && <span className="ml-3 text-neutral-500">Sent {formatParisDate(results.sentAt)}</span>}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {totals.sent} sent · {totals.bounced} bounced · {totals.complained} marked as spam
          {sending && " · still sending"}
          <button type="button" onClick={load} disabled={isPending} className={`ml-3 ${toolButtonClass}`}>
            {isPending ? "Refreshing…" : "Refresh"}
          </button>
        </p>
      </div>

      {totals.sent === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No results yet.</p>
      ) : (
        <>
          <StackedBars versions={versions} totals={totals} />
          <VersionRows versions={versions} />
          {results.followUp && results.followUp.sent > 0 && <FollowUpRow followUp={results.followUp} />}
          <PeopleLists
            siteId={siteId}
            campaignId={campaignId}
            campaignName={campaignName}
            versions={versions}
            colourOf={colourOf}
            counts={{ clicked: totals.clicked, openedNotClicked: totals.opened - totals.clicked }}
            refreshKey={results}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// The bars
// ---------------------------------------------------------------------

function StackedBars({
  versions,
  totals,
}: {
  versions: VersionCounts[];
  totals: Record<Stage["key"], number>;
}) {
  const scale = totals.delivered > 0 ? BAR_HEIGHT / totals.delivered : 0;
  return (
    <div className="flex items-end justify-center gap-5">
      {STAGES.map((stage) => (
        <div key={stage.key} className="flex w-40 flex-col items-stretch gap-2">
          <div className="flex flex-col justify-end gap-[2px]">
            {versions.map((v, i) => {
              const count = v[stage.key];
              if (count === 0) return null;
              const height = Math.max(PART_MIN_HEIGHT, count * scale);
              return (
                <div
                  key={v.mailId}
                  title={`${v.label}: ${count} ${stage.label.toLowerCase()}`}
                  className="flex items-center justify-center rounded text-sm font-semibold text-white"
                  style={{ height, background: VERSION_COLOURS[i] }}
                >
                  {count}
                </div>
              );
            })}
          </div>
          <div className={`${boxClass} justify-between`}>
            <span className="px-2 py-1 font-semibold text-neutral-900">{stage.label}</span>
            <span className="border-l border-neutral-300 px-3 py-1 tabular-nums text-neutral-800">
              {totals[stage.key]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// A row per version
// ---------------------------------------------------------------------

function VersionRows({ versions }: { versions: VersionCounts[] }) {
  const leader = leadingVersion(versions);
  return (
    <div className="flex flex-col items-center gap-2">
      {versions.map((v, i) => {
        const rates = versionRates(v);
        const leading = leader && "mailId" in leader && leader.mailId === v.mailId;
        return (
          <div key={v.mailId} className="flex flex-wrap items-center gap-2">
            <div className={`${boxClass} w-52 gap-2 px-2 py-1`}>
              <span className="h-5 w-8 shrink-0 rounded" style={{ background: VERSION_COLOURS[i] }} />
              <span className="flex-1 truncate text-right text-neutral-800">{v.label}</span>
            </div>
            <Rate label="Open" value={rates.open} />
            <Rate label="Click" value={rates.click} />
            <Rate label="Conversion" value={rates.conversion} strong={!!leading} />
            {leading && <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-white">Best</span>}
          </div>
        );
      })}
      {leader && "tooEarly" in leader && (
        <p className="text-xs text-neutral-500">
          Too early to say which version converts best — the differences could still be chance.
        </p>
      )}
      <p className="max-w-xl text-center text-xs text-neutral-400">
        Open = opened ÷ delivered · Click = clicked ÷ opened · Conversion = clicked ÷ sent. Opens read high
        (Apple Mail opens every mail), so compare versions on Conversion.
      </p>
    </div>
  );
}

// The follow-up's own numbers (it isn't one of the versions compared).
function FollowUpRow({ followUp }: { followUp: FollowUpResults }) {
  const rates = versionRates(followUp);
  return (
    <div className="flex flex-col items-center gap-1 border-t border-neutral-200 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`${boxClass} w-52 gap-2 px-2 py-1`}>
          <span className="h-5 w-8 shrink-0 rounded bg-neutral-400" />
          <span className="flex-1 truncate text-right text-neutral-800">{followUp.label}</span>
        </div>
        <Rate label="Open" value={rates.open} />
        <Rate label="Click" value={rates.click} />
        <Rate label="Conversion" value={rates.conversion} />
      </div>
      <p className="text-xs text-neutral-500">
        To: {followUp.who} · {followUp.sent} sent · {followUp.bounced} bounced · {followUp.complained} marked as spam
      </p>
    </div>
  );
}

function Rate({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className={`${boxClass} ${strong ? "border-neutral-900" : ""}`}>
      <span className="px-2 py-1 text-neutral-700">{label}</span>
      <span
        className={`w-16 border-l border-neutral-300 px-2 py-1 text-right tabular-nums ${
          strong ? "font-semibold text-neutral-900" : "text-neutral-800"
        }`}
      >
        {formatPercent(value)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Who clicked / who opened but didn't click
// ---------------------------------------------------------------------

const LISTS: { value: PeopleList; label: string; dateLabel: string; file: string }[] = [
  { value: "clicked", label: "Clicked", dateLabel: "Clicked", file: "clicked" },
  { value: "openedNotClicked", label: "Opened, didn't click", dateLabel: "Opened", file: "opened-not-clicked" },
];

function PeopleLists({
  siteId,
  campaignId,
  campaignName,
  versions,
  colourOf,
  counts,
  refreshKey,
}: {
  siteId: string;
  campaignId: string;
  campaignName: string;
  versions: VersionCounts[];
  colourOf: (mailId: string) => string;
  counts: Record<PeopleList, number>;
  refreshKey: unknown;
}) {
  const [list, setList] = useState<PeopleList>("clicked");
  const [version, setVersion] = useState<string>("");
  const [people, setPeople] = useState<ResultPerson[] | null>(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let current = true;
    setPeople(null);
    setShown(PAGE);
    getCampaignPeople(campaignId, siteId, list).then((rows) => {
      if (current) setPeople(rows);
    });
    return () => {
      current = false;
    };
  }, [campaignId, siteId, list, refreshKey]);

  const labelOf = useMemo(() => new Map(versions.map((v) => [v.mailId, v.label])), [versions]);
  const filtered = useMemo(
    () => (people ?? []).filter((p) => !version || p.mailId === version),
    [people, version]
  );
  const current = LISTS.find((l) => l.value === list)!;

  const download = () => {
    const csv = Papa.unparse(
      filtered.map((p) => ({
        Name: p.name,
        Email: p.email,
        Version: labelOf.get(p.mailId) ?? "",
        Language: p.language,
        [current.dateLabel]: formatParisDateTime(p.at),
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaignName.replace(/[^\w-]+/g, "-")}-${current.file}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-neutral-300 p-0.5">
          {LISTS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setList(l.value)}
              className={`rounded px-3 py-1 text-sm ${
                list === l.value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {l.label} ({counts[l.value]})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {versions.length > 1 && (
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              aria-label="Version"
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800"
            >
              <option value="">All versions</option>
              {versions.map((v) => (
                <option key={v.mailId} value={v.mailId}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={download} disabled={!people || filtered.length === 0} className={toolButtonClass}>
            Download CSV
          </button>
        </div>
      </div>

      {people === null ? (
        <p className="py-4 text-center text-xs text-neutral-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-neutral-400">No one yet.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-1.5 pr-2 font-normal">Name</th>
              <th className="py-1.5 pr-2 font-normal">Email</th>
              <th className="w-40 py-1.5 pr-2 font-normal">Version</th>
              <th className="w-12 py-1.5 pr-2 font-normal">Lang.</th>
              <th className="w-36 py-1.5 font-normal">{current.dateLabel}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((p) => (
              <tr key={`${p.mailId}:${p.email}`} className="border-b border-neutral-100">
                <td className="truncate py-1.5 pr-2 text-neutral-900">{p.name || "—"}</td>
                <td className="truncate py-1.5 pr-2 text-neutral-600">{p.email}</td>
                <td className="py-1.5 pr-2 text-xs text-neutral-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colourOf(p.mailId) }} />
                    <span className="truncate">{labelOf.get(p.mailId)}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-xs text-neutral-500">{p.language}</td>
                <td className="py-1.5 text-xs text-neutral-500">{formatParisDateTime(p.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`self-center ${toolButtonClass}`}>
          Show more ({filtered.length - shown} more)
        </button>
      )}
    </div>
  );
}
