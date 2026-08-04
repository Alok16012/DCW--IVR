import { timingSafeEqual } from "crypto";
import type {
  OutboundRequest,
  ProviderResult,
  RingRequest,
  TelephonyEvent,
  TelephonyEventType,
  TelephonyProvider,
} from "./provider";

// MyOperator adapter — built against MyOperator's published API surface
// (official Postman collection, documenter.getpostman.com/view/38426694).
//
// Like Buzzdial, MyOperator's IVR call flow (menus, greetings, department
// hunting order, sticky agent, office hours, voicemail) is configured in the
// MyOperator panel — there is NO public API to create or edit it. What the API
// does give us, and what this adapter uses:
//
//  - OBD API (click-to-call):  POST https://obd-api.myoperator.co/obd-api-v1
//  - User API (agent lookup):  GET  https://developers.myoperator.co/search/user
//  - Webhooks v2 (inbound):    call.initiated | call.dial_begin | call.answered |
//                              call.end | call.summary | disposition
//
// Webhooks v2 are far richer than Buzzdial's single post-call ping: every event
// carries a legs[] array with per-leg dial_status, ring_duration and talk time,
// and call.summary additionally carries full agent identity (uuid, name, email,
// extension). call.end is the primary completion event; call.summary arrives
// separately and is where the agent's NAME comes from — the engine patches it
// onto the already-recorded call.
//
// Panel setup (see README "Going live with MyOperator"):
//  - APIs & Webhooks → Webhooks → v2 → Add Webhook, pointed at
//    {NEXT_PUBLIC_APP_URL}/api/webhooks/telephony, with auth type "API Key"
//    sending header `x-webhook-token` = MYOPERATOR_WEBHOOK_SECRET.

type MyOperatorConfig = {
  companyId: string;
  apiKey: string;
  secretToken: string;
  publicIvrId: string;
  obdUrl: string;
  apiBaseUrl: string;
  /** Token for developers.myoperator.co (user search, recording links). */
  searchToken?: string;
  webhookSecret?: string;
};

function readConfig(): MyOperatorConfig | null {
  const companyId = process.env.MYOPERATOR_COMPANY_ID;
  const apiKey = process.env.MYOPERATOR_API_KEY;
  const secretToken = process.env.MYOPERATOR_SECRET_TOKEN;
  const publicIvrId = process.env.MYOPERATOR_PUBLIC_IVR_ID;
  if (!companyId || !apiKey || !secretToken || !publicIvrId) return null;
  return {
    companyId,
    apiKey,
    secretToken,
    publicIvrId,
    obdUrl: process.env.MYOPERATOR_OBD_URL || "https://obd-api.myoperator.co/obd-api-v1",
    apiBaseUrl: (process.env.MYOPERATOR_API_URL || "https://developers.myoperator.co").replace(/\/$/, ""),
    searchToken: process.env.MYOPERATOR_SEARCH_TOKEN,
    webhookSecret: process.env.MYOPERATOR_WEBHOOK_SECRET,
  };
}

/** MyOperator's v2 webhook envelope (only the fields we consume). */
type V2Leg = {
  leg_index?: number;
  uid?: string;
  type?: "agent" | "customer" | string;
  phone_number?: string;
  dial_status?: string;
  result?: string;
  ring_duration?: number | null;
  talk_duration?: number | null;
  agent?: { uuid?: string; name?: string; email?: string | null; contact?: string; extension?: string } | null;
};

type V2Envelope = {
  event_id?: string;
  event_type?: string;
  company_id?: string;
  direction?: string;
  session_id?: string;
  system_identifier?: string | null;
  customer_identifier?: string | null;
  timestamp?: string;
  payload?: {
    id?: string;
    did?: string;
    direction?: string;
    customer_number?: string;
    status?: string;
    category?: string;
    duration?: number;
    started_at?: string;
    ended_at?: string;
    recording_filename?: string;
    ref_id?: string;
    client_ref_id?: string;
    legs?: V2Leg[];
  };
};

/** Whole-call status → our event type. `bridged` is the only connected outcome;
 *  `missed` and `voicemail` both mean no agent ever took the call. */
function typeForStatus(status: string | undefined, duration: number | undefined): TelephonyEventType {
  switch ((status ?? "").toLowerCase()) {
    case "bridged":
      return "call.completed";
    case "missed":
    case "voicemail":
      return "leg.no_answer";
    default:
      return duration && duration > 0 ? "call.completed" : "leg.no_answer";
  }
}

/** The agent leg that matters: the one who answered, else the last one tried. */
function pickAgentLeg(legs: V2Leg[] | undefined): V2Leg | undefined {
  const agentLegs = (legs ?? []).filter((l) => l.type === "agent");
  if (!agentLegs.length) return undefined;
  return (
    agentLegs.find((l) => l.result === "answered" || l.dial_status === "ANSWER") ??
    agentLegs[agentLegs.length - 1]
  );
}

export class MyOperatorTelephonyProvider implements TelephonyProvider {
  readonly name = "myoperator";
  private config = readConfig();
  readonly live = this.config !== null;
  /** agent phone (last 10 digits) → MyOperator user uuid */
  private userIdCache = new Map<string, string>();

  private static digits(s: string): string {
    return s.replace(/\D/g, "").slice(-10);
  }

  /** Resolve a MyOperator user uuid from an agent's phone number so we can use
   *  the User Dialer. Returns undefined when the search token isn't configured
   *  or the agent isn't in MyOperator's roster — the caller then falls back to
   *  the Anonymous Dialer. */
  private async resolveUserId(agentPhone: string): Promise<string | undefined> {
    const c = this.config;
    if (!c?.searchToken) return undefined;
    const key = MyOperatorTelephonyProvider.digits(agentPhone);
    const cached = this.userIdCache.get(key);
    if (cached) return cached;
    try {
      const url = new URL(`${c.apiBaseUrl}/search/user`);
      url.searchParams.set("token", c.searchToken);
      url.searchParams.set("keyword", key);
      const res = await fetch(url.toString());
      if (!res.ok) return undefined;
      const data = (await res.json()) as {
        data?: { uuid?: string; contact_number?: string }[];
      };
      const hit = (data.data ?? []).find(
        (u) => u.contact_number && MyOperatorTelephonyProvider.digits(u.contact_number) === key,
      );
      if (hit?.uuid) {
        this.userIdCache.set(key, hit.uuid);
        return hit.uuid;
      }
    } catch {
      // network/API failure — fall back to the Anonymous Dialer
    }
    return undefined;
  }

  /** OBD call: bridge an agent to a customer. Uses the User Dialer when the
   *  agent resolves to a MyOperator uuid, otherwise the Anonymous Dialer.
   *  `reference_id` carries OUR call id so the webhooks can be tied back. */
  private async placeCall(
    agentPhone: string,
    customerNumber: string,
    referenceId: string,
  ): Promise<ProviderResult> {
    const c = this.config;
    if (!c) {
      return { accepted: false, detail: "MyOperator not configured (MYOPERATOR_* env missing)" };
    }

    const userId = await this.resolveUserId(agentPhone);
    const body: Record<string, string> = {
      company_id: c.companyId,
      secret_token: c.secretToken,
      // "1" is the direct dialer (User or Anonymous); "2" drops the customer
      // into the IVR instead of a specific agent, which is not what we want.
      type: "1",
      number: customerNumber,
      public_ivr_id: c.publicIvrId,
      reference_id: referenceId,
    };
    // user_id and number_2 are mutually exclusive — sending both is a 403.
    if (userId) body.user_id = userId;
    else body.number_2 = agentPhone;

    try {
      const res = await fetch(c.obdUrl, {
        method: "POST",
        headers: { "x-api-key": c.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let unique: string | undefined;
      let details: string | undefined;
      try {
        const data = JSON.parse(text) as { unique_id?: string; details?: string; status?: string };
        unique = data.unique_id;
        details = data.details;
      } catch {
        // non-JSON body — keep the raw text for the log line below
      }
      return {
        accepted: res.ok,
        // The webhooks key off session_id / our reference_id, not unique_id, so
        // report the reference we sent as the correlating id.
        providerCallId: res.ok ? referenceId : undefined,
        detail: res.ok
          ? `MyOperator OBD accepted${unique ? ` (request ${unique})` : ""}${userId ? " via user dialer" : " via anonymous dialer"}`
          : `MyOperator error ${res.status}: ${details ?? text.slice(0, 200)}`,
      };
    } catch (err) {
      return { accepted: false, detail: `MyOperator request failed: ${(err as Error).message}` };
    }
  }

  async ringAgent(req: RingRequest): Promise<ProviderResult> {
    // Inbound calls are hunted by MyOperator's own IVR; this path is for
    // app-driven attempts (callback retries), where OBD gives the same bridge.
    return this.placeCall(req.agentPhone, req.customerNumber, req.callId);
  }

  async initiateOutbound(req: OutboundRequest): Promise<ProviderResult> {
    return this.placeCall(req.agentPhone, req.customerNumber, req.callId);
  }

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    // MyOperator does NOT sign webhook payloads. Instead the panel lets you
    // attach outbound auth to its POSTs (None / Basic / API Key header or
    // query + custom headers) — configure an API key header named
    // `x-webhook-token`. The route also accepts it as a ?token= query param.
    const secret = this.config?.webhookSecret;
    if (!secret) return true; // dev/staging convenience — always set it in prod
    const headerToken = headers["x-webhook-token"] ?? headers["x-api-key"];
    let bodyToken: string | undefined;
    if (!headerToken) {
      try {
        bodyToken = (JSON.parse(rawBody) as { token?: string }).token;
      } catch {
        bodyToken = undefined;
      }
    }
    const candidate = headerToken ?? bodyToken;
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): TelephonyEvent | null {
    const b = body as V2Envelope;
    if (!b || typeof b !== "object" || !b.event_type) return null;

    const p = b.payload ?? {};
    // session_id is stable across every event of a call. For calls WE placed,
    // reference_id (our own call id) comes back on the payload — prefer it so
    // the event lands on the call row we already created.
    const providerCallId = p.ref_id || p.client_ref_id || b.session_id || p.id;
    if (!providerCallId) return null;

    const agentLeg = pickAgentLeg(p.legs);
    const duration = p.duration ?? agentLeg?.talk_duration ?? undefined;

    let type: TelephonyEventType;
    switch (b.event_type) {
      case "call.initiated":
        type = "call.initiated";
        break;
      case "call.dial_begin":
        type = "leg.ringing";
        break;
      case "call.answered":
        type = "leg.answered";
        break;
      case "call.end":
      case "call.summary":
        type = typeForStatus(p.status, duration);
        break;
      default:
        // disposition/comment events carry no call-state change we model
        return null;
    }

    return {
      // event_id is per-delivery — exactly the idempotency key we need.
      providerEventId: b.event_id ?? `mo-${providerCallId}-${b.event_type}`,
      type,
      providerCallId,
      providerLegId: agentLeg?.uid,
      agentId: agentLeg?.agent?.uuid,
      agentPhone: agentLeg?.phone_number ?? agentLeg?.agent?.contact,
      agentName: agentLeg?.agent?.name ?? undefined,
      caller: b.customer_identifier ?? p.customer_number ?? undefined,
      // system_identifier is empty on call.summary by design — fall back to did
      destination: p.did || b.system_identifier || undefined,
      direction: (p.direction ?? b.direction) === "incoming" ? "inbound" : "outbound",
      durationSeconds: duration ?? undefined,
      ringSeconds: agentLeg?.ring_duration ?? undefined,
      // Webhooks carry only a filename; exchange it for a playable link via
      // GET /search/recordings/link (valid 24h) when the recording is opened.
      recordingRef: p.recording_filename,
      timestamp: p.started_at ?? b.timestamp ?? new Date().toISOString(),
      raw: b as unknown as Record<string, unknown>,
    };
  }

  /** Exchange a recording_filename from a webhook for a playable URL.
   *  MyOperator's links expire after 24 hours, so resolve on demand. */
  async recordingUrl(filename: string): Promise<string | null> {
    const c = this.config;
    if (!c?.searchToken) return null;
    try {
      const url = new URL(`${c.apiBaseUrl}/search/recordings/link`);
      url.searchParams.set("token", c.searchToken);
      url.searchParams.set("file", filename);
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = (await res.json()) as { url?: string; link?: string; data?: { url?: string } };
      return data.url ?? data.link ?? data.data?.url ?? null;
    } catch {
      return null;
    }
  }
}
