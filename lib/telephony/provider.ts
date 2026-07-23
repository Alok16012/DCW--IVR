// Provider-agnostic telephony interface (PRD §15: "Provider-specific code
// isolated behind a common service interface to reduce vendor lock-in").
//
// The routing engine and webhook handler speak ONLY this interface. Swapping
// the mock provider for Exotel is a config change (TELEPHONY_PROVIDER env),
// not a code change to any business logic.

export type TelephonyEventType =
  | "call.initiated" // provider created an inbound/outbound call
  | "leg.ringing" // an agent leg started ringing
  | "leg.answered" // an agent answered
  | "leg.busy"
  | "leg.rejected"
  | "leg.no_answer"
  | "leg.failed"
  | "call.completed" // connected call ended
  | "call.failed"; // whole call failed at provider

/** Normalized event shape every provider adapter must emit (matches webhook payloads). */
export type TelephonyEvent = {
  providerEventId: string; // unique per delivery — idempotency key
  type: TelephonyEventType;
  providerCallId: string;
  providerLegId?: string;
  agentId?: string;
  caller?: string;
  destination?: string;
  direction?: "inbound" | "outbound";
  durationSeconds?: number;
  ringSeconds?: number;
  recordingRef?: string;
  timestamp: string;
  raw?: Record<string, unknown>;
};

export type RingRequest = {
  callId: string;
  attemptId: string;
  agentId: string;
  agentPhone: string;
  customerNumber: string;
  timeoutSeconds: number;
};

export type OutboundRequest = {
  callId: string;
  agentId: string;
  agentPhone: string;
  customerNumber: string;
  callerId: string;
};

export type ProviderResult = {
  providerCallId?: string;
  providerLegId?: string;
  accepted: boolean;
  detail?: string;
};

export interface TelephonyProvider {
  readonly name: string;
  /** True when the provider can place real PSTN calls (Exotel with valid creds). */
  readonly live: boolean;
  /** Ask the provider to ring one agent's phone for a queued attempt. */
  ringAgent(req: RingRequest): Promise<ProviderResult>;
  /** Initiate a tracked outbound (click-to-call) call. */
  initiateOutbound(req: OutboundRequest): Promise<ProviderResult>;
  /** Verify an inbound webhook's authenticity (signature/credentials). */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean;
  /** Parse a raw provider webhook body into the normalized event shape. */
  parseWebhook(body: unknown, headers: Record<string, string>): TelephonyEvent | null;
}
