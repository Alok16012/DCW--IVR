import { describe, it, expect } from "vitest";
import { evaluateOfficeHours } from "./office-hours";
import type { BusinessHour, Holiday } from "@/lib/types";

function hours(over: Partial<BusinessHour> & { day_of_week: number }): BusinessHour {
  return {
    id: `h${over.day_of_week}`,
    organization_id: "org",
    open_time: "09:00",
    close_time: "18:00",
    enabled: true,
    ...over,
  };
}

// Mon–Sat 09:00–18:00, closed Sunday
const week: BusinessHour[] = [0, 1, 2, 3, 4, 5, 6].map((d) => hours({ day_of_week: d, enabled: d !== 0 }));

// Dates are UTC-explicit (Z) and evaluated in the "UTC" business timezone so the
// assertions are independent of the machine running the tests.
describe("evaluateOfficeHours (PRD §7.4)", () => {
  it("open during business hours on a weekday", () => {
    const res = evaluateOfficeHours(new Date("2026-07-23T12:00:00Z"), "UTC", week, []);
    expect(res.open).toBe(true);
  });

  it("closed before opening time", () => {
    const res = evaluateOfficeHours(new Date("2026-07-23T07:30:00Z"), "UTC", week, []);
    expect(res.open).toBe(false);
    if (!res.open) expect(res.reason).toBe("closed");
  });

  it("closed after closing time", () => {
    const res = evaluateOfficeHours(new Date("2026-07-23T19:30:00Z"), "UTC", week, []);
    expect(res.open).toBe(false);
  });

  it("closed on a disabled day (Sunday)", () => {
    const res = evaluateOfficeHours(new Date("2026-07-26T12:00:00Z"), "UTC", week, []); // Sunday
    expect(res.open).toBe(false);
    if (!res.open) expect(res.reason).toBe("closed");
  });

  it("closed on a holiday even during business hours", () => {
    const holidays: Holiday[] = [
      { id: "x", organization_id: "org", holiday_date: "2026-07-23", label: "Founder's Day", fallback_rule: "callback" },
    ];
    const res = evaluateOfficeHours(new Date("2026-07-23T12:00:00Z"), "UTC", week, holidays);
    expect(res.open).toBe(false);
    if (!res.open) {
      expect(res.reason).toBe("holiday");
      expect(res.label).toBe("Founder's Day");
    }
  });
});
