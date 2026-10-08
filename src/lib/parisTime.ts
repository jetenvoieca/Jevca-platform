// Campaign send times are always Paris time (Craig's choice, 2026-10-08),
// whatever the computer's own clock is set to. These turn a Paris date
// and time into the moment it stands for (stored in UTC), and back.
// Plain module.

const ZONE = "Europe/Paris";

// The Paris clock's parts at a moment.
function parisParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// "2026-11-14" + "11:15" (Paris) → the moment. Null if either isn't a
// real date or time.
export function parisToDate(date: string, time: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{2}):(\d{2})$/);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [...d.slice(1), ...t.slice(1)].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  // Start from the same clock reading in UTC, then move by Paris's
  // offset at that moment (twice, in case the offset changes in between).
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = parisParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess);
}

// The moment as a Paris date ("2026-11-14") and time ("11:15").
export function dateToParis(at: Date): { date: string; time: string } {
  const p = parisParts(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour)}:${two(p.minute)}` };
}

// "Sat 14 Nov, 11:15" (Paris), for showing a send time.
export function formatParis(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}
