import { describe, it, expect } from "vitest";
import { maskPhone, formatDuration, humanDuration, pct, initials, toCsv, csvEscape } from "./utils";

describe("maskPhone (PRD §18 privacy)", () => {
  it("masks the middle, keeps last 4", () => {
    const masked = maskPhone("+91 98765 43210");
    expect(masked.endsWith("3210")).toBe(true);
    expect(masked).not.toContain("98765");
  });
  it("returns dash for empty", () => {
    expect(maskPhone(null)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("formats m:ss", () => expect(formatDuration(75)).toBe("1:15"));
  it("formats h:mm:ss", () => expect(formatDuration(3725)).toBe("1:02:05"));
  it("dash for null", () => expect(formatDuration(null)).toBe("—"));
});

describe("humanDuration", () => {
  it("compact seconds", () => expect(humanDuration(45)).toBe("45s"));
  it("minutes and seconds", () => expect(humanDuration(150)).toBe("2m 30s"));
});

describe("pct (dashboard/report math)", () => {
  it("computes percentage rounded to 0.1", () => expect(pct(3, 4)).toBe(75));
  it("guards divide by zero", () => expect(pct(5, 0)).toBe(0));
});

describe("initials", () => {
  it("uses up to two words", () => expect(initials("Riya Sharma")).toBe("RS"));
});

describe("csv export (AC-08)", () => {
  it("escapes commas and quotes", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
  it("builds a header + rows", () => {
    const csv = toCsv([{ a: 1, b: "x" }], ["a", "b"]);
    expect(csv).toBe("a,b\n1,x\n");
  });
});
