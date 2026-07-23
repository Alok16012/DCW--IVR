import { randomUUID } from "crypto";
import type {
  OutboundRequest,
  ProviderResult,
  RingRequest,
  TelephonyEvent,
  TelephonyProvider,
} from "./provider";

// Deterministic-ish mock outcomes so demos are realistic. A ring attempt
// resolves to answered / no_answer / busy according to a weighted roll. The
// dashboard's "Simulate next attempt" button and the API also let an operator
// force a specific outcome, mirroring the sample front-end.

export type MockOutcome = "answered" | "no_answer" | "busy" | "rejected";

export function rollMockOutcome(): MockOutcome {
  const r = Math.random();
  if (r < 0.45) return "answered";
  if (r < 0.75) return "no_answer";
  if (r < 0.9) return "busy";
  return "rejected";
}

export function mockEventForOutcome(
  outcome: MockOutcome,
  ctx: { providerCallId: string; providerLegId: string; agentId: string; ringSeconds: number },
): TelephonyEvent {
  const base = {
    providerEventId: randomUUID(),
    providerCallId: ctx.providerCallId,
    providerLegId: ctx.providerLegId,
    agentId: ctx.agentId,
    ringSeconds: ctx.ringSeconds,
    timestamp: new Date().toISOString(),
  };
  switch (outcome) {
    case "answered":
      return { ...base, type: "leg.answered" };
    case "busy":
      return { ...base, type: "leg.busy" };
    case "rejected":
      return { ...base, type: "leg.rejected" };
    case "no_answer":
    default:
      return { ...base, type: "leg.no_answer" };
  }
}

export class MockTelephonyProvider implements TelephonyProvider {
  readonly name = "mock";
  readonly live = false;

  async ringAgent(req: RingRequest): Promise<ProviderResult> {
    // In a real provider this dials the agent leg; the mock just acknowledges
    // and the outcome arrives via the simulated webhook.
    return {
      accepted: true,
      providerLegId: `mock-leg-${req.attemptId.slice(0, 8)}`,
      detail: `Mock ring ${req.agentPhone} for ${req.timeoutSeconds}s`,
    };
  }

  async initiateOutbound(req: OutboundRequest): Promise<ProviderResult> {
    return {
      accepted: true,
      providerCallId: `mock-out-${randomUUID().slice(0, 8)}`,
      detail: `Mock outbound to ${req.customerNumber}`,
    };
  }

  verifyWebhook(): boolean {
    return true; // mock webhooks are trusted (local simulation only)
  }

  parseWebhook(body: unknown): TelephonyEvent | null {
    const b = body as Partial<TelephonyEvent>;
    if (!b || !b.type || !b.providerCallId || !b.providerEventId) return null;
    return b as TelephonyEvent;
  }
}
