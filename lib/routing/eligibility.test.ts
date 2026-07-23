import { describe, it, expect } from "vitest";
import { buildEligibleSequence, isWithinShift, rotate } from "./eligibility";
import type { Agent, RoutingRuleAgent } from "@/lib/types";

function agent(over: Partial<Agent>): Agent {
  return {
    id: over.id ?? "a1",
    organization_id: "org",
    profile_id: null,
    name: over.name ?? "Agent",
    email: null,
    employee_code: null,
    phone: over.phone ?? "+91 90000 00000",
    phone_verified: over.phone_verified ?? true,
    team_id: null,
    priority: over.priority ?? 100,
    ring_timeout: over.ring_timeout ?? 20,
    availability: over.availability ?? "available",
    shift_start: over.shift_start ?? null,
    shift_end: over.shift_end ?? null,
    fallback_owner: false,
    active: over.active ?? true,
    created_at: "",
    updated_at: "",
    ...over,
  } as Agent;
}

function ra(agent_id: string, sequence: number, over: Partial<RoutingRuleAgent> = {}): RoutingRuleAgent {
  return { id: `rra-${agent_id}`, rule_id: "r", agent_id, sequence, enabled: true, timeout_override: null, ...over };
}

const ctx = { now: new Date("2026-07-23T12:00:00"), busyAgentIds: new Set<string>() };

describe("buildEligibleSequence (PRD §8 eligibility)", () => {
  it("orders agents by rule sequence", () => {
    const agents = new Map([
      ["a1", agent({ id: "a1", name: "A1" })],
      ["a2", agent({ id: "a2", name: "A2" })],
      ["a3", agent({ id: "a3", name: "A3" })],
    ]);
    const rules = [ra("a3", 1), ra("a1", 2), ra("a2", 3)];
    const seq = buildEligibleSequence(rules, agents, ctx);
    expect(seq.map((e) => e.agent.id)).toEqual(["a3", "a1", "a2"]);
  });

  it("excludes offline, leave, busy, inactive, unverified agents", () => {
    const agents = new Map([
      ["ok", agent({ id: "ok" })],
      ["offline", agent({ id: "offline", availability: "offline" })],
      ["leave", agent({ id: "leave", availability: "leave" })],
      ["busy", agent({ id: "busy", availability: "busy" })],
      ["inactive", agent({ id: "inactive", active: false })],
      ["unverified", agent({ id: "unverified", phone_verified: false })],
    ]);
    const rules = ["ok", "offline", "leave", "busy", "inactive", "unverified"].map((id, i) => ra(id, i + 1));
    const seq = buildEligibleSequence(rules, agents, ctx);
    expect(seq.map((e) => e.agent.id)).toEqual(["ok"]);
  });

  it("skips agents already on a live call (concurrency)", () => {
    const agents = new Map([
      ["a1", agent({ id: "a1" })],
      ["a2", agent({ id: "a2" })],
    ]);
    const rules = [ra("a1", 1), ra("a2", 2)];
    const seq = buildEligibleSequence(rules, agents, { now: ctx.now, busyAgentIds: new Set(["a1"]) });
    expect(seq.map((e) => e.agent.id)).toEqual(["a2"]);
  });

  it("excludes agents disabled in the routing rule", () => {
    const agents = new Map([
      ["a1", agent({ id: "a1" })],
      ["a2", agent({ id: "a2" })],
    ]);
    const rules = [ra("a1", 1, { enabled: false }), ra("a2", 2)];
    const seq = buildEligibleSequence(rules, agents, ctx);
    expect(seq.map((e) => e.agent.id)).toEqual(["a2"]);
  });

  it("applies per-rule timeout override, else agent timeout", () => {
    const agents = new Map([["a1", agent({ id: "a1", ring_timeout: 20 })]]);
    const withOverride = buildEligibleSequence([ra("a1", 1, { timeout_override: 12 })], agents, ctx);
    const withoutOverride = buildEligibleSequence([ra("a1", 1)], agents, ctx);
    expect(withOverride[0].timeout).toBe(12);
    expect(withoutOverride[0].timeout).toBe(20);
  });
});

describe("isWithinShift", () => {
  const now = new Date("2026-07-23T12:00:00");
  it("true when no shift configured", () => {
    expect(isWithinShift(agent({ shift_start: null, shift_end: null }), now)).toBe(true);
  });
  it("true inside a normal daytime shift", () => {
    expect(isWithinShift(agent({ shift_start: "09:00", shift_end: "18:00" }), now)).toBe(true);
  });
  it("false outside a normal daytime shift", () => {
    expect(isWithinShift(agent({ shift_start: "13:00", shift_end: "18:00" }), now)).toBe(false);
  });
  it("handles overnight shifts wrapping midnight", () => {
    const night = new Date("2026-07-23T23:00:00");
    expect(isWithinShift(agent({ shift_start: "22:00", shift_end: "06:00" }), night)).toBe(true);
  });
});

describe("rotate (round-robin)", () => {
  it("rotates left by offset", () => {
    expect(rotate([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(rotate([1, 2, 3, 4], 2)).toEqual([3, 4, 1, 2]);
  });
  it("wraps offsets larger than length", () => {
    expect(rotate([1, 2, 3], 4)).toEqual([2, 3, 1]);
  });
  it("offset 0 and empty are safe", () => {
    expect(rotate([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(rotate([], 3)).toEqual([]);
  });
});
