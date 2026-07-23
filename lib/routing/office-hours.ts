import type { BusinessHour, Holiday } from "@/lib/types";

export type OfficeState =
  | { open: true }
  | { open: false; reason: "closed" | "holiday"; label?: string; fallbackRule?: string | null };

/**
 * Decide whether the org is open right now (PRD §7.4). Uses the org timezone so
 * routing follows the business's local clock, not the server's.
 */
export function evaluateOfficeHours(
  now: Date,
  timezone: string,
  hours: BusinessHour[],
  holidays: Holiday[],
): OfficeState {
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const isoDate = local.toISOString().slice(0, 10);

  const holiday = holidays.find((h) => h.holiday_date === isoDate);
  if (holiday) {
    return { open: false, reason: "holiday", label: holiday.label ?? "Holiday", fallbackRule: holiday.fallback_rule };
  }

  const dow = local.getDay(); // 0=Sun..6=Sat
  const today = hours.find((h) => h.day_of_week === dow);
  if (!today || !today.enabled) return { open: false, reason: "closed" };

  const minutes = local.getHours() * 60 + local.getMinutes();
  const [oh, om] = today.open_time.split(":").map(Number);
  const [ch, cm] = today.close_time.split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;

  if (minutes >= openMin && minutes < closeMin) return { open: true };
  return { open: false, reason: "closed" };
}
