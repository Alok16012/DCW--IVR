import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/telephony";
import { rateLimit } from "@/lib/rate-limit";

// Authenticated recording playback (PRD §18: provider URLs are never public).
// The browser plays `/api/recordings/<callId>`; this route checks the session,
// confirms the caller is allowed to see THAT call via RLS, then resolves the
// provider reference to audio. Providers hand us either a direct URL
// (Buzzdial) or a bare filename that must be exchanged for a short-lived link
// (MyOperator) — both are resolved here and never sent to the client.

export async function GET(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  const { callId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`recording:${user.id}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  // Read the call through the USER's client so row-level security decides
  // whether this person may hear it (agents only get their own calls).
  const { data: call } = await supabase.from("calls").select("id").eq("id", callId).maybeSingle();
  if (!call) return NextResponse.json({ error: "not found" }, { status: 404 });

  const db = createAdminClient();
  const { data: recording } = await db
    .from("recordings")
    .select("provider_ref")
    .eq("call_id", callId)
    .maybeSingle();

  const ref = recording?.provider_ref;
  if (!ref) return NextResponse.json({ error: "no recording" }, { status: 404 });

  const sourceUrl = await resolveRecordingUrl(ref);
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "recording reference cannot be resolved to audio" },
      { status: 502 },
    );
  }

  try {
    // Stream it through so the provider URL (and any embedded credentials)
    // never reaches the browser. Range headers are forwarded so seeking works.
    const range = req.headers.get("range");
    const upstream = await fetch(sourceUrl, {
      headers: range ? { Range: range } : undefined,
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `provider returned ${upstream.status}` }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "audio/mpeg");
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    // Recording links expire; don't let a shared/proxy cache hold onto audio.
    headers.set("Cache-Control", "private, no-store");
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return NextResponse.json(
      { error: `recording fetch failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}

/** Turn whatever the provider stored into a fetchable audio URL. */
async function resolveRecordingUrl(ref: string): Promise<string | null> {
  if (/^https?:\/\//i.test(ref)) return ref;

  // Not a URL — ask the provider to mint one from its file reference.
  const provider = getProvider() as { recordingUrl?: (file: string) => Promise<string | null> };
  if (typeof provider.recordingUrl === "function") {
    return provider.recordingUrl(ref);
  }
  return null;
}
