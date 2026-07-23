import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/telephony";
import { ingestEvent } from "@/lib/telephony/ingest";

// Inbound telephony webhook (PRD §15). Responsibilities:
//  - verify signature/credentials (webhook security)
//  - idempotency: a duplicate providerEventId must not double-process (AC-10)
//  - acknowledge fast, apply the event to the journey state machine
export async function POST(req: NextRequest) {
  const provider = getProvider();
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  if (!provider.verifyWebhook(headers, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = Object.fromEntries(new URLSearchParams(rawBody));
  }

  const event = provider.parseWebhook(parsed, headers);
  if (!event) return NextResponse.json({ error: "unparseable" }, { status: 400 });

  const db = createAdminClient();
  const result = await ingestEvent(db, event, rawBody);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false });
}
