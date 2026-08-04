import { beforeEach, describe, expect, it } from "vitest";
import { MyOperatorTelephonyProvider } from "./myoperator-provider";

const ENV_KEYS = [
  "MYOPERATOR_COMPANY_ID",
  "MYOPERATOR_API_KEY",
  "MYOPERATOR_SECRET_TOKEN",
  "MYOPERATOR_PUBLIC_IVR_ID",
  "MYOPERATOR_SEARCH_TOKEN",
  "MYOPERATOR_WEBHOOK_SECRET",
  "MYOPERATOR_OBD_URL",
  "MYOPERATOR_API_URL",
];

function makeProvider(env: Record<string, string> = {}) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return new MyOperatorTelephonyProvider();
}

const CONFIGURED = {
  MYOPERATOR_COMPANY_ID: "6836cad944e39380",
  MYOPERATOR_API_KEY: "test-api-key",
  MYOPERATOR_SECRET_TOKEN: "test-secret",
  MYOPERATOR_PUBLIC_IVR_ID: "68749ed88306c330",
};

// Verbatim from MyOperator's official Postman collection (v2 webhooks).
const CALL_END_INBOUND = {
  company_id: "6836cad944e39380",
  event_id: "event-end-incoming-1",
  event_type: "call.end",
  event_sequence: 3001,
  event_version: "1",
  timestamp: "2025-12-23T12:21:48.962Z",
  channel: "call",
  direction: "incoming",
  session_id: "s4.1766492465.1359",
  system_identifier: "+911206544510",
  customer_identifier: "+917906225789",
  payload: {
    id: "s4.1766492465.1359",
    did: "+911206544510",
    direction: "incoming",
    customer_number: "+917906225789",
    status: "bridged",
    started_at: "2025-12-23T12:21:05.779Z",
    ended_at: "2025-12-23T12:21:48.962Z",
    category: "incoming",
    duration: 43,
    recording_filename: "5228226174b1fbe7-v2.mp3",
    billable: true,
    ref_id: "",
    client_ref_id: "",
    obd_campaign: null,
    legs: [
      {
        leg_index: 1,
        uid: "s4.1766492465.1359",
        type: "customer",
        phone_number: "+917906225789",
        result: "connected",
        dial_status: "",
        ring_duration: null,
        talk_duration: 43,
      },
      {
        leg_index: 2,
        uid: "s4.1766492465.1360",
        type: "agent",
        phone_number: "+919873641288",
        dial_status: "ANSWER",
        result: "answered",
        dept_id: "dept123",
        talk_duration: 6,
        ring_duration: 9,
      },
    ],
  },
};

// call.summary is the only event carrying agent name — note the hunt across
// two agents: leg 2 was BUSY, leg 3 answered.
const CALL_SUMMARY_INBOUND = {
  company_id: "6836cad944e39380",
  event_id: "event-6576745f8fafabe9",
  event_type: "call.summary",
  event_sequence: 1,
  timestamp: "2026-04-14T05:29:28.838594394Z",
  direction: "incoming",
  session_id: "15.1776144484.2922",
  system_identifier: "",
  customer_identifier: "+919876543210",
  payload: {
    id: "15.1776144484.2922",
    direction: "incoming",
    customer_number: "+919876543210",
    status: "bridged",
    started_at: "2026-04-14T05:28:04+00:00",
    ended_at: "2026-04-14T05:29:26+00:00",
    category: "incoming",
    duration: 82,
    recording_filename: "7b8aff8e25f29185-v2.mp3",
    ref_id: "",
    legs: [
      {
        leg_index: 1,
        agent: null,
        type: "customer",
        phone_number: "+919876543210",
        result: "connected",
        talk_duration: 82,
        ring_duration: null,
      },
      {
        leg_index: 2,
        type: "agent",
        agent: {
          uuid: "6836cad947bcc605",
          name: "Agent1 Name",
          email: "xyz@email.com",
          contact: "+911234567890",
          extension: "10",
        },
        dial_status: "BUSY",
        result: "not_answered",
        phone_number: "+911234567890",
        ring_duration: 22,
        talk_duration: null,
      },
      {
        leg_index: 3,
        type: "agent",
        agent: {
          uuid: "69d4d6bb5ffa3909",
          name: "Agent2 Name",
          email: null,
          contact: "+913214567890",
          extension: "15",
        },
        dial_status: "ANSWER",
        result: "answered",
        phone_number: "+913214567890",
        ring_duration: 8,
        talk_duration: 82,
      },
    ],
  },
};

describe("MyOperatorTelephonyProvider", () => {
  beforeEach(() => {
    makeProvider();
  });

  it("is not live until every required credential is set", () => {
    expect(makeProvider().live).toBe(false);
    for (const missing of Object.keys(CONFIGURED)) {
      const partial = Object.fromEntries(
        Object.entries(CONFIGURED).filter(([k]) => k !== missing),
      );
      expect(makeProvider(partial).live, `missing ${missing}`).toBe(false);
    }
    expect(makeProvider(CONFIGURED).live).toBe(true);
  });

  describe("parseWebhook", () => {
    it("maps an answered inbound call.end to a completed call", () => {
      const ev = makeProvider(CONFIGURED).parseWebhook(CALL_END_INBOUND);
      expect(ev).not.toBeNull();
      expect(ev!.type).toBe("call.completed");
      expect(ev!.providerEventId).toBe("event-end-incoming-1"); // per-delivery id
      expect(ev!.providerCallId).toBe("s4.1766492465.1359"); // stable session id
      expect(ev!.caller).toBe("+917906225789");
      expect(ev!.destination).toBe("+911206544510");
      expect(ev!.direction).toBe("inbound");
      expect(ev!.durationSeconds).toBe(43);
      expect(ev!.recordingRef).toBe("5228226174b1fbe7-v2.mp3");
      // agent identity comes off the agent leg, not the customer leg
      expect(ev!.agentPhone).toBe("+919873641288");
      expect(ev!.ringSeconds).toBe(9);
      expect(ev!.providerLegId).toBe("s4.1766492465.1360");
      // call.end never carries the agent's name — that's call.summary's job
      expect(ev!.agentName).toBeUndefined();
    });

    it("takes the answering agent from call.summary, not the busy one", () => {
      const ev = makeProvider(CONFIGURED).parseWebhook(CALL_SUMMARY_INBOUND);
      expect(ev!.type).toBe("call.completed");
      expect(ev!.agentName).toBe("Agent2 Name");
      expect(ev!.agentPhone).toBe("+913214567890");
      expect(ev!.agentId).toBe("69d4d6bb5ffa3909");
      // system_identifier is empty on call.summary by design
      expect(ev!.destination).toBeUndefined();
    });

    it("treats missed and voicemail calls as unanswered", () => {
      const p = makeProvider(CONFIGURED);
      const missed = {
        ...CALL_END_INBOUND,
        event_id: "e-missed",
        payload: { ...CALL_END_INBOUND.payload, status: "missed", duration: 0, legs: [] },
      };
      expect(p.parseWebhook(missed)!.type).toBe("leg.no_answer");

      const voicemail = {
        ...CALL_END_INBOUND,
        event_id: "e-vm",
        payload: { ...CALL_END_INBOUND.payload, status: "voicemail", duration: 12, legs: [] },
      };
      expect(p.parseWebhook(voicemail)!.type).toBe("leg.no_answer");
    });

    it("maps the lifecycle events to leg states", () => {
      const p = makeProvider(CONFIGURED);
      const at = (event_type: string) =>
        p.parseWebhook({ ...CALL_END_INBOUND, event_type, event_id: `e-${event_type}` })!.type;
      expect(at("call.initiated")).toBe("call.initiated");
      expect(at("call.dial_begin")).toBe("leg.ringing");
      expect(at("call.answered")).toBe("leg.answered");
    });

    it("prefers our own reference id so outbound calls match their call row", () => {
      const ourCallId = "8f1c2d3e-4b5a-6789-abcd-ef0123456789";
      const ev = makeProvider(CONFIGURED).parseWebhook({
        ...CALL_END_INBOUND,
        direction: "outgoing",
        payload: { ...CALL_END_INBOUND.payload, direction: "outgoing", ref_id: ourCallId },
      });
      expect(ev!.providerCallId).toBe(ourCallId);
      expect(ev!.direction).toBe("outbound");
    });

    it("ignores events that carry no call-state change", () => {
      const p = makeProvider(CONFIGURED);
      expect(p.parseWebhook({ event_type: "disposition", session_id: "s1", payload: {} })).toBeNull();
      expect(p.parseWebhook({ foo: "bar" })).toBeNull();
      // an event with no id at all is unusable
      expect(p.parseWebhook({ event_type: "call.end", payload: {} })).toBeNull();
    });
  });

  describe("verifyWebhook", () => {
    it("accepts anything when no secret is configured", () => {
      expect(makeProvider(CONFIGURED).verifyWebhook({}, "{}")).toBe(true);
    });

    it("accepts the configured token from either header", () => {
      const p = makeProvider({ ...CONFIGURED, MYOPERATOR_WEBHOOK_SECRET: "s3cret" });
      expect(p.verifyWebhook({ "x-webhook-token": "s3cret" }, "{}")).toBe(true);
      expect(p.verifyWebhook({ "x-api-key": "s3cret" }, "{}")).toBe(true);
    });

    it("rejects a missing or wrong token", () => {
      const p = makeProvider({ ...CONFIGURED, MYOPERATOR_WEBHOOK_SECRET: "s3cret" });
      expect(p.verifyWebhook({}, "{}")).toBe(false);
      expect(p.verifyWebhook({ "x-webhook-token": "nope" }, "{}")).toBe(false);
      expect(p.verifyWebhook({ "x-webhook-token": "s3cret-but-longer" }, "{}")).toBe(false);
    });
  });

  describe("placing calls", () => {
    it("refuses to dial when unconfigured", async () => {
      const res = await makeProvider().initiateOutbound({
        callId: "c1",
        agentId: "a1",
        agentName: "Riya",
        agentPhone: "+919000010001",
        customerNumber: "+919876543210",
        callerId: "+919000010001",
      });
      expect(res.accepted).toBe(false);
      expect(res.detail).toMatch(/not configured/i);
    });

    it("uses the anonymous dialer and sends our call id as reference_id", async () => {
      const p = makeProvider(CONFIGURED);
      const calls: { url: string; body: Record<string, string>; headers: Record<string, string> }[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init.body)),
          headers: init.headers as Record<string, string>,
        });
        return new Response(
          JSON.stringify({ details: "Request accepted successfully", status: "success", code: "200", unique_id: "req-1" }),
          { status: 200 },
        );
      }) as typeof fetch;

      try {
        const res = await p.initiateOutbound({
          callId: "call-uuid-1",
          agentId: "a1",
          agentName: "Riya",
          agentPhone: "+919000010001",
          customerNumber: "+919876543210",
          callerId: "+919000010001",
        });
        expect(res.accepted).toBe(true);
        expect(res.providerCallId).toBe("call-uuid-1");
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://obd-api.myoperator.co/obd-api-v1");
        expect(calls[0].headers["x-api-key"]).toBe("test-api-key");
        expect(calls[0].body).toMatchObject({
          company_id: CONFIGURED.MYOPERATOR_COMPANY_ID,
          secret_token: CONFIGURED.MYOPERATOR_SECRET_TOKEN,
          type: "1",
          number: "+919876543210",
          number_2: "+919000010001",
          public_ivr_id: CONFIGURED.MYOPERATOR_PUBLIC_IVR_ID,
          reference_id: "call-uuid-1",
        });
        // user_id and number_2 are mutually exclusive — sending both is a 403
        expect(calls[0].body.user_id).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("surfaces a provider rejection instead of reporting success", async () => {
      const p = makeProvider(CONFIGURED);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ details: "invalid public_ivr_id", status: "error", code: "403" }), {
          status: 403,
        })) as typeof fetch;
      try {
        const res = await p.ringAgent({
          callId: "call-2",
          attemptId: "att-1",
          agentId: "a1",
          agentName: "Riya",
          agentPhone: "+919000010001",
          customerNumber: "+919876543210",
          timeoutSeconds: 20,
        });
        expect(res.accepted).toBe(false);
        expect(res.detail).toContain("invalid public_ivr_id");
        expect(res.providerCallId).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
