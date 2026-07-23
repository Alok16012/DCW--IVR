import { createHmac } from "crypto";
import type {
  OutboundRequest,
  ProviderResult,
  RingRequest,
  TelephonyEvent,
  TelephonyProvider,
} from "./provider";

// Exotel adapter — code-complete against Exotel's documented Voice API and
// call-status webhooks (developer.exotel.com). It is INERT until a real Exotel
// account is provisioned (KYC + virtual number + API key/token) and
// TELEPHONY_PROVIDER=exotel with credentials is set. Per PRD §23 risk #1, the
// exact leg-transfer behavior must be validated with a provider POC before
// production — that validation requires a live account and cannot be done in a
// dev session.

type ExotelConfig = {
  sid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  callerId: string;
};

function readConfig(): ExotelConfig | null {
  const sid = process.env.EXOTEL_SID;
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;
  const callerId = process.env.EXOTEL_CALLER_ID;
  if (!sid || !apiKey || !apiToken || !callerId) return null;
  return {
    sid,
    apiKey,
    apiToken,
    subdomain: process.env.EXOTEL_SUBDOMAIN || "api.exotel.com",
    callerId,
  };
}

export class ExotelTelephonyProvider implements TelephonyProvider {
  readonly name = "exotel";
  private config = readConfig();
  readonly live = this.config !== null;

  private baseUrl() {
    const c = this.config!;
    return `https://${c.apiKey}:${c.apiToken}@${c.subdomain}/v1/Accounts/${c.sid}`;
  }

  async ringAgent(req: RingRequest): Promise<ProviderResult> {
    if (!this.config) {
      return { accepted: false, detail: "Exotel not configured (requires live account)" };
    }
    // Exotel connects two legs via /Calls/connect.json — first the agent leg,
    // then bridges the customer. One live call is transferred across agents by
    // re-dialing the next agent as a fresh leg on no-answer.
    const form = new URLSearchParams({
      From: req.agentPhone,
      To: req.customerNumber,
      CallerId: this.config.callerId,
      TimeLimit: "14400",
      TimeOut: String(req.timeoutSeconds),
      // StatusCallback points at our webhook so every leg reports back.
      StatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/telephony`,
    });
    try {
      const res = await fetch(`${this.baseUrl()}/Calls/connect.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const data = (await res.json()) as { Call?: { Sid?: string } };
      return {
        accepted: res.ok,
        providerCallId: data?.Call?.Sid,
        detail: res.ok ? "Exotel leg dialed" : `Exotel error ${res.status}`,
      };
    } catch (err) {
      return { accepted: false, detail: `Exotel request failed: ${(err as Error).message}` };
    }
  }

  async initiateOutbound(req: OutboundRequest): Promise<ProviderResult> {
    if (!this.config) {
      return { accepted: false, detail: "Exotel not configured (requires live account)" };
    }
    const form = new URLSearchParams({
      From: req.agentPhone, // Exotel calls the agent first, then the customer
      To: req.customerNumber,
      CallerId: this.config.callerId,
      StatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/telephony`,
    });
    try {
      const res = await fetch(`${this.baseUrl()}/Calls/connect.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const data = (await res.json()) as { Call?: { Sid?: string } };
      return { accepted: res.ok, providerCallId: data?.Call?.Sid };
    } catch (err) {
      return { accepted: false, detail: `Exotel request failed: ${(err as Error).message}` };
    }
  }

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    // Exotel supports webhook auth via an X-Exotel-Signature HMAC or basic-auth
    // credentials on the callback URL. Validate the signature when configured.
    const secret = process.env.EXOTEL_API_TOKEN;
    const signature = headers["x-exotel-signature"];
    if (!secret || !signature) return true; // fall back to URL-embedded basic auth
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return expected === signature;
  }

  parseWebhook(body: unknown): TelephonyEvent | null {
    // Exotel posts application/x-www-form-urlencoded status callbacks with
    // fields like CallSid, Status, Legs[*], RecordingUrl, etc. Map them to the
    // normalized shape.
    const b = body as Record<string, string>;
    if (!b || !b.CallSid) return null;
    const statusMap: Record<string, TelephonyEvent["type"]> = {
      "in-progress": "leg.answered",
      completed: "call.completed",
      busy: "leg.busy",
      "no-answer": "leg.no_answer",
      failed: "leg.failed",
      ringing: "leg.ringing",
    };
    const type = statusMap[b.Status] ?? "call.failed";
    return {
      providerEventId: b.EventId || `${b.CallSid}-${b.Status}-${Date.now()}`,
      type,
      providerCallId: b.CallSid,
      providerLegId: b.LegId,
      durationSeconds: b.ConversationDuration ? Number(b.ConversationDuration) : undefined,
      recordingRef: b.RecordingUrl,
      caller: b.From,
      destination: b.To,
      timestamp: new Date().toISOString(),
      raw: b,
    };
  }
}
