import { beforeEach, describe, expect, it } from "vitest";
import { BuzzdialTelephonyProvider } from "./buzzdial-provider";

function makeProvider(env: Record<string, string | undefined> = {}) {
  const keys = [
    "BUZZDIAL_AUTH_KEY",
    "BUZZDIAL_BASE_URL",
    "BUZZDIAL_WEBHOOK_SECRET",
    "BUZZDIAL_DID_NUMBER",
    "BUZZDIAL_RECORDING_URL_TEMPLATE",
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
      // agent identity survives even though this agent isn't in our roster;
      // Buzzdial's "Name(extension)suffix" label is reduced to the name
      expect(ev!.agentName).toBe("Punni");
      expect(ev!.agentPhone).toBe("7004054302");
    });

    it("omits an agent name that is empty or only a placeholder", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-8", cust_no: "98", agent_name: "()" });
      expect(ev!.agentName).toBeUndefined();
    });

    it("infers a missed call from duration 0 when no status field", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-9", cust_no: "98", duration: "0" });
      expect(ev!.type).toBe("leg.no_answer");
    });

    it("treats an EMPTY duration as a call that ended unanswered", () => {
      // Buzzdial sends duration:"" when nobody picked up. Reading that as
      // "no duration field" made the call invisible in the app entirely.
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({
        call_id: "bz-10",
        cust_no: "9852711784",
        agent_no: "",
        agent_name: "",
        duration: "",
        datetime: "2026-08-05 18:43:38",
      });
      expect(ev!.type).toBe("leg.no_answer");
      expect(ev!.durationSeconds).toBe(0);
    });

    it("only reports call.initiated when duration is genuinely absent", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-11", cust_no: "98" });
      expect(ev!.type).toBe("call.initiated");
      expect(ev!.durationSeconds).toBeUndefined();
    });

    it("gives the start and end deliveries distinct idempotency keys", () => {
      // trigger event "All" fires twice per call and carries no event id — if
      // both deliveries hash to the same key the second is dropped as a
      // duplicate and the completed call never lands
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const start = p.parseWebhook({ call_id: "bz-12", cust_no: "98" });
      const end = p.parseWebhook({ call_id: "bz-12", cust_no: "98", duration: "42" });
      expect(start!.providerEventId).not.toBe(end!.providerEventId);
      expect(start!.providerCallId).toBe(end!.providerCallId); // same call, though
    });

    it("leaves recording empty when the account's URL pattern is unknown", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      const ev = p.parseWebhook({ call_id: "bz-7", cust_no: "98", duration: "30" });
      expect(ev!.recordingRef).toBeUndefined();
    });

    it("falls back to the call id as the recording ref once a template is set", () => {
      const p = makeProvider({
        BUZZDIAL_AUTH_KEY: "k",
        BUZZDIAL_RECORDING_URL_TEMPLATE: "https://buzzdial.io/rec/{call_id}.mp3",
      });
      const answered = p.parseWebhook({ call_id: "bz-7", cust_no: "98", duration: "30" });
      expect(answered!.recordingRef).toBe("bz-7");
      // a missed call has no recording to point at
      const missed = p.parseWebhook({ call_id: "bz-8", cust_no: "98", duration: "0" });
      expect(missed!.recordingRef).toBeUndefined();
    });

    it("rejects a payload with no call reference", () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      expect(p.parseWebhook({ foo: "bar" })).toBeNull();
    });
  });

  describe("recordingUrl", () => {
    it("returns nothing when no template is configured", async () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      expect(await p.recordingUrl("bz-7")).toBeNull();
    });

    it("expands the call id into the configured template", async () => {
      const p = makeProvider({
        BUZZDIAL_AUTH_KEY: "k",
        BUZZDIAL_RECORDING_URL_TEMPLATE: "https://buzzdial.io/rec/{call_id}.mp3",
      });
      expect(await p.recordingUrl("bz-7")).toBe("https://buzzdial.io/rec/bz-7.mp3");
    });

    it("passes through a reference that is already a URL", async () => {
      const p = makeProvider({ BUZZDIAL_AUTH_KEY: "k" });
      expect(await p.recordingUrl("https://buzzdial.io/rec/x.mp3")).toBe(
        "https://buzzdial.io/rec/x.mp3",
      );
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
