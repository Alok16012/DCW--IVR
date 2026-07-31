import { beforeEach, describe, expect, it } from "vitest";
import { BuzzdialTelephonyProvider } from "./buzzdial-provider";

function makeProvider(env: Record<string, string | undefined> = {}) {
  const keys = [
    "BUZZDIAL_AUTH_KEY",
    "BUZZDIAL_BASE_URL",
    "BUZZDIAL_WEBHOOK_SECRET",
    "BUZZDIAL_DID_NUMBER",
  ];
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
  return new BuzzdialTelephonyProvider();
}

describe("BuzzdialTelephonyProvider", () => {
  beforeEach(() => {
    makeProvider();
  });

  it("is not live without an auth key", () => {
    const p = makeProvider();
    expect(p.live).toBe(false);
  });

  it("is live with an auth key", () => {
    const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
    expect(p.live).toBe(true);
  });

  describe("parseWebhook", () => {
    it("maps a received event with duration to call.completed", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({
        call_id: "bz-123",
        cust_no: "9876543210",
        agent_no: "9111111111",
        call_type: "received",
        duration: "45",
        recording: "https://buzzdial.io/rec/1.mp3",
      });
      expect(ev).not.toBeNull();
      expect(ev!.type).toBe("call.completed");
      expect(ev!.providerCallId).toBe("bz-123");
      expect(ev!.caller).toBe("9876543210");
      expect(ev!.durationSeconds).toBe(45);
      expect(ev!.recordingRef).toBe("https://buzzdial.io/rec/1.mp3");
    });

    it("maps a received event without duration to leg.answered", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-1", cust_no: "98", call_type: "received" });
      expect(ev!.type).toBe("leg.answered");
    });

    it("maps miscall to leg.no_answer", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-2", cust_no: "98", event: "miscall" });
      expect(ev!.type).toBe("leg.no_answer");
    });

    it("builds a stable providerEventId when none is supplied", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const a = p.parseWebhook({ call_id: "bz-3", cust_no: "98", event: "miscall" });
      const b = p.parseWebhook({ call_id: "bz-3", cust_no: "98", event: "miscall" });
      expect(a!.providerEventId).toBe(b!.providerEventId); // idempotency key
    });

    it("parses a real Buzzdial trigger payload (no status field, IST datetime)", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      // captured verbatim from a live Buzzdial trigger delivery
      const ev = p.parseWebhook({
        token: "secret",
        call_id: "a0fb5e888bb455a65fbef1143de24756",
        cust_no: "9852711784",
        agent_no: "7004054302",
        datetime: "2026-07-31 17:52:25",
        duration: "55",
        agent_name: "Punni()don",
      });
      expect(ev).not.toBeNull();
      // no status param mapped → inferred from duration > 0
      expect(ev!.type).toBe("call.completed");
      expect(ev!.durationSeconds).toBe(55);
      // naive IST datetime pinned to +05:30 → correct UTC instant
      expect(ev!.timestamp).toBe("2026-07-31T12:22:25.000Z");
    });

    it("infers a missed call from duration 0 when no status field", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-9", cust_no: "98", duration: "0" });
      expect(ev!.type).toBe("leg.no_answer");
    });

    it("rejects a payload with no call reference", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      expect(p.parseWebhook({ foo: "bar" })).toBeNull();
    });
  });

  describe("verifyWebhook", () => {
    it("accepts anything when no secret configured", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      expect(p.verifyWebhook({}, "{}")).toBe(true);
    });

    it("accepts a matching token in the body", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k", BUZZDIAL_WEBHOOK_SECRET: "s3cret" });
      expect(p.verifyWebhook({}, JSON.stringify({ token: "s3cret" }))).toBe(true);
      expect(p.verifyWebhook({}, "token=s3cret&cust_no=98")).toBe(true);
    });

    it("accepts a matching x-webhook-token header", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k", BUZZDIAL_WEBHOOK_SECRET: "s3cret" });
      expect(p.verifyWebhook({ "x-webhook-token": "s3cret" }, "{}")).toBe(true);
    });

    it("rejects a missing or wrong token", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k", BUZZDIAL_WEBHOOK_SECRET: "s3cret" });
      expect(p.verifyWebhook({}, "{}")).toBe(false);
      expect(p.verifyWebhook({}, JSON.stringify({ token: "wrong" }))).toBe(false);
      expect(p.verifyWebhook({ "x-webhook-token": "nope" }, "{}")).toBe(false);
    });
  });
});
