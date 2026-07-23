import type { Agent, RoutingRuleAgent } from "@/lib/types";

export type EligibleAgent = {
  agent: Agent;
  sequence: number;
  timeout: number;
};

export type EligibilityContext = {
  now: Date;
  busyAgentIds: Set<string>; // agents currently on a live platform call (concurrency skip)
};

/** Is an agent within their configured shift window right now? */
export function isWithinShift(agent: Agent, now: Date): boolean {
  if (!agent.shift_start || !agent.shift_end) return true; // no shift => always
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = agent.shift_start.split(":").map(Number);
  const [eh, em] = agent.shift_end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return minutes >= start && minutes < end;
  // overnight shift wraps past midnight
  return minutes >= start || minutes < end;
}

/**
 * Order the rule's agents into the eligible ring sequence (PRD §8).
 * Eligibility: active, available, in-shift, not on leave, verified number,
 * enabled in the rule, and not already on a live platform call.
 */
export function buildEligibleSequence(
  ruleAgents: RoutingRuleAgent[],
  agentsById: Map<string, Agent>,
  ctx: EligibilityContext,
): EligibleAgent[] {
  return ruleAgents
    .filter((ra) => ra.enabled)
    .map((ra) => ({ ra, agent: agentsById.get(ra.agent_id) }))
    .filter((x): x is { ra: RoutingRuleAgent; agent: Agent } => Boolean(x.agent))
    .filter(({ agent }) => {
      if (!agent.active) return false;
      if (!agent.phone || !agent.phone_verified) return false;
      if (agent.availability === "offline" || agent.availability === "leave") return false;
      if (agent.availability === "busy") return false;
      if (ctx.busyAgentIds.has(agent.id)) return false; // concurrency
      if (!isWithinShift(agent, ctx.now)) return false;
      return true;
    })
    // primary order = rule sequence; tie-break by agent.priority (PRD §8)
    .sort((a, b) => a.ra.sequence - b.ra.sequence || a.agent.priority - b.agent.priority)
    .map(({ ra, agent }) => ({
      agent,
      sequence: ra.sequence,
      timeout: ra.timeout_override ?? agent.ring_timeout,
    }));
}

/**
 * Rotate an ordered list left by `offset` positions. Used for round-robin mode
 * (PRD §8 / §24): the eligible sequence starts from a different agent each call
 * so load is distributed fairly instead of always starting at priority 1.
 */
export function rotate<T>(arr: T[], offset: number): T[] {
  if (arr.length === 0) return arr;
  const k = ((offset % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}
