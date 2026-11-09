import { formatDate } from "@/lib/formatDate";

// An exhibition's dates on a tile: "01/02/2026 - 01/05/2026", either end
// alone, or nothing (the Exhibitions catalogue and the Artist App).
export function exhibitionDates(startDate: string | null, endDate: string | null): string {
  return [startDate, endDate].filter((d): d is string => !!d).map(formatDate).join(" - ");
}
