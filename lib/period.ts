export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

export type DateRange = { from: Date; to: Date; key: PeriodKey };

export function resolvePeriod(
  key: string | undefined,
  from?: string,
  to?: string,
): DateRange {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (key) {
    case "yesterday": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      const end = new Date(startOfToday);
      return { from: start, to: end, key: "yesterday" };
    }
    case "7d": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { from: start, to: now, key: "7d" };
    }
    case "30d": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { from: start, to: now, key: "30d" };
    }
    case "custom": {
      if (from && to) {
        const f = new Date(from);
        f.setHours(0, 0, 0, 0);
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        return { from: f, to: t, key: "custom" };
      }
      return { from: startOfToday, to: now, key: "today" };
    }
    case "today":
    default:
      return { from: startOfToday, to: now, key: "today" };
  }
}
