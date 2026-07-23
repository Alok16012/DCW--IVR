import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit (PRD §17 abuse protection)", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const key = `test-${Math.random()}`;
    const results = Array.from({ length: 5 }, () => rateLimit(key, 3, 10_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
  });

  it("resets after the window elapses", async () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 1, 20).allowed).toBe(true);
    expect(rateLimit(key, 1, 20).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(rateLimit(key, 1, 20).allowed).toBe(true);
  });
});
