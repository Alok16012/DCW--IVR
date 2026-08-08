/**
 * Push a call to the DCW CRM as a lead.
 *
 * Every caller who reaches the IVR is a prospect the counselling team should
 * follow up on, so each call is posted to the CRM's /api/leads/ivr webhook.
 * The CRM turns the caller's number into a lead with source "IVR" and hands it
 * to the counsellor whose name matches the agent we send here — that is how
 * Aditi's and Purnima's IVR calls end up in their own CRM lead lists.
 *
 * Best-effort by design: the CRM being slow, down, or unconfigured must never
 * fail a webhook or break call routing. Failures are logged and dropped.
 */

export interface CrmLeadPush {
  /** The customer's number. */
  caller: string;
  callerName?: string | null;
  /** Agent who took the call — the CRM matches this to a counsellor by name. */
  agentName?: string | null;
  agentPhone?: string | null;
  status?: string;
  direction?: string;
  durationSeconds?: number;
  startedAt?: string | null;
  callId?: string;
  providerCallId?: string | null;
  businessNumber?: string | null;
  recordingRef?: string | null;
}

const TIMEOUT_MS = 6000;

export async function pushLeadToCrm(input: CrmLeadPush): Promise<void> {
  const url = process.env.CRM_LEAD_WEBHOOK_URL;
  const secret = process.env.CRM_LEAD_WEBHOOK_SECRET;

  // Not wired up (local dev, or CRM sync deliberately off) — nothing to do.
  if (!url || !secret) return;
  if (!input.caller) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({
        caller: input.caller,
        caller_name: input.callerName ?? null,
        agent_name: input.agentName ?? null,
        agent_phone: input.agentPhone ?? null,
        status: input.status ?? null,
        direction: input.direction ?? "inbound",
        duration_seconds: input.durationSeconds ?? 0,
        started_at: input.startedAt ?? new Date().toISOString(),
        call_id: input.callId ?? null,
        provider_call_id: input.providerCallId ?? null,
        business_number: input.businessNumber ?? null,
        recording_ref: input.recordingRef ?? null,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`CRM lead push rejected (${res.status}):`, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("CRM lead push failed:", (err as Error).message);
  }
}
