import { describe, expect, it } from "vitest";
import { applyTelephonyEvent } from "./engine";
import type { TelephonyEvent } from "@/lib/telephony/provider";

// A minimal Supabase-shaped stub. It records the rows written to `calls` and
// enforces the one schema rule this path kept getting wrong: talk_seconds is
// NOT NULL, so an explicit null must be rejected exactly as Postgres would.
function makeDb(
  opts: { existingCall?: Record<string, unknown> | null; callInsertError?: { code: string; message: string } } = {},
) {
  const inserted: Record<string, Record<string, unknown>[]> = {};

  const table = (name: string) => {
    const rows: Record<string, unknown>[] = [];
    const api: Record<string, unknown> = {};

    const thenable = (value: unknown) => ({
      ...api,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve),
    });

    Object.assign(api, {
      select: () => api,
      eq: () => api,
      in: () => api,
      not: () => api,
      or: () => api,
      gte: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: () => {
        if (name === "calls") return Promise.resolve({ data: opts.existingCall ?? null });
        if (name === "organizations") return Promise.resolve({ data: { id: "org-1" } });
        return Promise.resolve({ data: null });
      },
      single: () => Promise.resolve({ data: null }),
      update: () => thenable({ data: null, error: null }),
      delete: () => thenable({ data: null, error: null }),
      insert: (row: Record<string, unknown>) => {
        const record = {
          select: () => ({
            single: () => {
              if (name === "calls" && opts.callInsertError) {
                return Promise.resolve({ data: null, error: opts.callInsertError });
              }
              if (name === "calls" && row.talk_seconds === null) {
                return Promise.resolve({
                  data: null,
                  error: {
                    code: "23502",
                    message: 'null value in column "talk_seconds" violates not-null constraint',
                  },
                });
              }
              (inserted[name] ??= []).push(row);
              return Promise.resolve({ data: { id: `${name}-1` }, error: null });
            },
            maybeSingle: () => {
              (inserted[name] ??= []).push(row);
              return Promise.resolve({ data: { id: `${name}-1` }, error: null });
            },
          }),
          then: (resolve: (v: unknown) => unknown) => {
            (inserted[name] ??= []).push(row);
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return record;
      },
      rows,
    });
    return api;
  };

  return {
    db: { from: (name: string) => table(name) } as never,
    inserted,
  };
}

const baseEvent: TelephonyEvent = {
  providerEventId: "bz-1",
  type: "call.initiated",
  providerCallId: "call-abc",
  caller: "9852711784",
  direction: "inbound",
  timestamp: "2026-08-05T13:56:01.000Z",
};

describe("provider-routed calls", () => {
  it("records a call that has not produced talk time yet", async () => {
    // Regression: durationSeconds is undefined on a start-of-call ping. Writing
    // that as NULL violated talk_seconds NOT NULL, the insert failed, and the
    // call silently never appeared in the app.
    const { db, inserted } = makeDb();
    await applyTelephonyEvent(db, baseEvent);

    expect(inserted.calls).toHaveLength(1);
    expect(inserted.calls[0].talk_seconds).toBe(0);
    expect(inserted.calls[0].status).toBe("ringing");
    expect(inserted.calls[0].provider_call_id).toBe("call-abc");
  });

  it("records an unanswered call as missed and opens a callback", async () => {
    const { db, inserted } = makeDb();
    await applyTelephonyEvent(db, {
      ...baseEvent,
      providerEventId: "bz-2",
      type: "leg.no_answer",
      durationSeconds: 0,
    });

    expect(inserted.calls[0].status).toBe("missed");
    expect(inserted.calls[0].talk_seconds).toBe(0);
    expect(inserted.callbacks).toHaveLength(1);
  });

  it("records an answered call with its talk time", async () => {
    const { db, inserted } = makeDb();
    await applyTelephonyEvent(db, {
      ...baseEvent,
      providerEventId: "bz-3",
      type: "call.completed",
      durationSeconds: 55,
      agentName: "Punni",
      agentPhone: "7004054302",
    });

    expect(inserted.calls[0].status).toBe("completed");
    expect(inserted.calls[0].talk_seconds).toBe(55);
    expect(inserted.calls[0].provider_agent_name).toBe("Punni");
  });

  it("surfaces a genuine insert failure instead of dropping the call silently", async () => {
    // A swallowed failure here is indistinguishable from "the provider never
    // called us" — which is exactly what made this bug take so long to find.
    const { db } = makeDb({
      callInsertError: { code: "23502", message: 'null value in column "caller"' },
    });
    await expect(applyTelephonyEvent(db, { ...baseEvent, providerEventId: "bz-4" })).rejects.toThrow(
      /failed to record provider-routed call/,
    );
  });

  it("stays quiet when another delivery already recorded the same call", async () => {
    const { db } = makeDb({
      callInsertError: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    await expect(
      applyTelephonyEvent(db, { ...baseEvent, providerEventId: "bz-5" }),
    ).resolves.toBeUndefined();
  });
});
