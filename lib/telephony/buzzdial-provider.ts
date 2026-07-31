import { timingSafeEqual } from "crypto";
import type {
  OutboundRequest,
  ProviderResult,
  RingRequest,
  TelephonyEvent,
  TelephonyProvider,
} from "./provider";

// Buzzdial adapter — built against the Buzzdial IVR helpdoc.
//
// Buzzdial's model differs from Exotel's: inbound IVR flow (greetings, keypress
// extensions, hunt strategy sequential/random, sticky agent, escalate/busy
// sound, voicemail) is configured in the Buzzdial portal, NOT via API. Our app
// receives inbound call events through Buzzdial's "Trigger" feature (portal →
// Trigger → API Trigger), which posts to our webhook URL for events:
// all / received / miscall.
//
// What we drive via API:
//  - Click-to-call (C2C):  GET /api/clicktocall.php?cust_no=&agent_no=&agent_name=&auth=
//  - Call masking:         GET /api/callmask.php?cust_no=&agent_no=&agent_name=&did=&auth=&service=start|stop&pin=&duration=
//
// Portal setup required (see README "Buzzdial setup"):
//  - Trigger → API Trigger → POST, event "All", URL:
//      {NEXT_PUBLIC_APP_URL}/api/webhooks/telephony
//    with parameter setup mapping (call_id, cust_no, agent_no, call_type,
//    duration, recording, event_id) and an extra param `token` set to
//    BUZZDIAL_WEBHOOK_SECRET so we can authenticate deliveries.

type BuzzdialConfig = {
  authKey: string;
  baseUrl: string;
  webhookSecret?: string;
  didNumber?: string;
};

function readConfig(): BuzzdialConfig | null {
  const authKey = process.env.BUZZDIAL_AUTH_KEY;
  if (!authKey) return null;
  return {
    authKey,
    baseUrl: (process.env.BUZZDIAL_BASE_URL || "https://buzzdial.io").replace(/\/$/, ""),
    webhookSecret: process.env.BUZZDIAL_WEBHOOK_SECRET,
    didNumber: process.env.BUZZDIAL_DID_NUMBER,
  };
}

/** Buzzdial trigger payloads use flexible param names (portal "Parameter setup").
 *  Accept the documented names plus common aliases so a mis-labelled mapping
 *  still parses. */
function pick(b: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const hit = b[k] ?? b[k.toLowerCase()] ?? b[k.toUpperCase()];
    if (hit !== undefined && hit !== "") return hit;
  }
  return undefined;
}

export class BuzzdialTelephonyProvider implements TelephonyProvider {
  readonly name = "buzzdial";
  private config = readConfig();
  readonly live = this.config !== null;

  /** C2C bridges agent → customer; used both for click-to-call and for ringing
   *  an agent on a queued attempt (Buzzdial dials the agent first, then
   *  connects the customer — same shape as Exotel's connect). */
  private async clickToCall(
    agentPhone: string,
    customerNumber: string,
    agentName: string,
  ): Promise<ProviderResult> {
    if (!this.config) {
      return { accepted: false, detail: "Buzzdial not configured (BUZZDIAL_AUTH_KEY missing)" };
    }
    const url = new URL(`${this.config.baseUrl}/api/clicktocall.php`);
    url.searchParams.set("cust_no", customerNumber);
    url.searchParams.set("agent_no", agentPhone);
    url.searchParams.set("agent_name", agentName);
    url.searchParams.set("auth", this.config.authKey);
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      const text = await res.text();
      // Buzzdial's helpdoc doesn't pin a response schema; try JSON first and
      // fall back to treating any 2xx as accepted, keeping the raw body for logs.
      let providerCallId: string | undefined;
      try {
        const data = JSON.parse(text) as Record<string, unknown>;
        providerCallId =
          (data.call_id as string) ?? (data.callid as string) ?? (data.id as string) ?? undefined;
      } catch {
        // non-JSON body — no call id available from the response
      }
      return {
        accepted: res.ok,
        providerCallId,
        detail: res.ok ? "Buzzdial C2C dialed" : `Buzzdial error ${res.status}: ${text.slice(0, 200)}`,
      };
    } catch (err) {
      return { accepted: false, detail: `Buzzdial request failed: ${(err as Error).message}` };
    }
  }

  async ringAgent(req: RingRequest): Promise<ProviderResult> {
    // Note: for pure inbound calls Buzzdial's own IVR does the hunting
    // (sequential/random + sticky agent, configured in the portal). ringAgent
    // is used by our engine for app-driven attempts (e.g. callback retries),
    // where C2C gives the same agent-first bridge.
    return this.clickToCall(req.agentPhone, req.customerNumber, req.agentId);
  }

  async initiateOutbound(req: OutboundRequest): Promise<ProviderResult> {
    return this.clickToCall(req.agentPhone, req.customerNumber, req.agentId);
  }

  /** Start/stop number-masked calling via a rented DID (helpdoc "Call Masking"). */
  async maskCall(opts: {
    customerNumber: string;
    agentPhone: string;
    agentName: string;
    service: "start" | "stop";
    pin?: string;
    durationSeconds?: number;
  }): Promise<ProviderResult> {
    if (!this.config) {
      return { accepted: false, detail: "Buzzdial not configured (BUZZDIAL_AUTH_KEY missing)" };
    }
    if (!this.config.didNumber) {
      return { accepted: false, detail: "BUZZDIAL_DID_NUMBER not set (DID is rented from Buzzdial)" };
    }
    const url = new URL(`${this.config.baseUrl}/api/callmask.php`);
    url.searchParams.set("cust_no", opts.customerNumber);
    url.searchParams.set("agent_no", opts.agentPhone);
    url.searchParams.set("agent_name", opts.agentName);
    url.searchParams.set("did", this.config.didNumber);
    url.searchParams.set("auth", this.config.authKey);
    url.searchParams.set("service", opts.service);
    if (opts.pin) url.searchParams.set("pin", opts.pin);
    if (opts.durationSeconds) url.searchParams.set("duration", String(opts.durationSeconds));
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      const text = await res.text();
      return {
        accepted: res.ok,
        detail: res.ok ? `Buzzdial mask ${opts.service}` : `Buzzdial error ${res.status}: ${text.slice(0, 200)}`,
      };
    } catch (err) {
      return { accepted: false, detail: `Buzzdial request failed: ${(err as Error).message}` };
    }
  }

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    // Buzzdial triggers don't sign payloads. We authenticate with a shared
    // secret that the portal's "Parameter setup" appends as `token` (body or
    // query) or an `x-webhook-token` header. If no secret is configured,
    // accept (dev/staging convenience) — set BUZZDIAL_WEBHOOK_SECRET in prod.
    const secret = this.config?.webhookSecret;
    if (!secret) return true;
    const headerToken = headers["x-webhook-token"];
    let bodyToken: string | undefined;
    try {
      const data = JSON.parse(rawBody) as Record<string, string>;
      bodyToken = data.token;
    } catch {
      bodyToken = new URLSearchParams(rawBody).get("token") ?? undefined;
    }
    const candidate = headerToken ?? bodyToken;
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): TelephonyEvent | null {
    const b = body as Record<string, string>;
    if (!b || typeof b !== "object") return null;

    const providerCallId = pick(b, "call_id", "callid", "uniqueid", "unique_id", "sid");
    const caller = pick(b, "cust_no", "caller", "caller_no", "from");
    const agentNo = pick(b, "agent_no", "agent", "agent_number");
    if (!providerCallId && !caller) return null;

    // Buzzdial trigger events: "received" (answered), "miscall" (missed), or
    // per-call status strings when mapped in Parameter setup.
    const status = (
      pick(b, "event", "call_type", "status", "type") ?? ""
    ).toLowerCase();
    const statusMap: Record<string, TelephonyEvent["type"]> = {
      received: "leg.answered",
      answered: "leg.answered",
      connected: "leg.answered",
      miscall: "leg.no_answer",
      misscall: "leg.no_answer",
      missed: "leg.no_answer",
      noanswer: "leg.no_answer",
      busy: "leg.busy",
      failed: "leg.failed",
      ringing: "leg.ringing",
      completed: "call.completed",
      hangup: "call.completed",
      disconnected: "call.completed",
    };
    const duration = pick(b, "duration", "call_duration", "billsec");
    // A "received" event carrying a duration means the call already finished —
    // treat it as completion so reports get the talk time.
    let type = statusMap[status];
    if (!type) {
      // No status field mapped in the portal trigger. Prefer agent answer time
      // (empty on missed calls) — Buzzdial's "duration" includes IVR/ring time,
      // so a missed call can still carry a non-zero duration.
      const answerTime = pick(b, "answer_time", "agent_answer_time", "answertime");
      if (answerTime !== undefined) {
        const answered = answerTime !== "" && answerTime !== "0" && !answerTime.startsWith("0000-");
        type = answered ? "call.completed" : "leg.no_answer";
      } else if (duration !== undefined) {
        type = Number(duration) > 0 ? "call.completed" : "leg.no_answer";
      } else {
        type = "call.initiated";
      }
    }
    if (type === "leg.answered" && duration && Number(duration) > 0) {
      type = "call.completed";
    }

    // Buzzdial sends naive IST datetimes ("2026-07-31 17:52:25") — pin the
    // +05:30 offset so started_at doesn't shift by 5.5h when parsed as UTC.
    const rawTs = pick(b, "datetime", "date", "call_start_time", "start_time");
    const timestamp =
      rawTs && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTs)
        ? new Date(`${rawTs.replace(" ", "T")}+05:30`).toISOString()
        : (rawTs ?? new Date().toISOString());

    const callRef = providerCallId ?? `${caller}-${rawTs ?? ""}`;
    return {
      providerEventId:
        pick(b, "event_id", "eventid") ?? `bz-${callRef}-${status || "event"}`,
      type,
      providerCallId: callRef,
      agentId: agentNo,
      caller,
      destination: pick(b, "did", "ivr_no", "to"),
      direction: "inbound",
      durationSeconds: duration ? Number(duration) : undefined,
      recordingRef: pick(b, "recording", "recording_url", "recordingurl"),
      timestamp,
      raw: b,
    };
  }
}
