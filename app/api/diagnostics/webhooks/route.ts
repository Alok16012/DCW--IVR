import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Recent provider webhook deliveries, for diagnosing "the call happened but
// nothing showed up". Providers differ in which fields they actually send —
// and Buzzdial's portal offers no way to preview a delivery — so seeing the
// raw payload is usually the fastest way to explain a missing call.
//
// Super Admin only: payloads contain customer phone numbers.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: events } = await db
    .from("webhook_events")
    .select("provider_event_id, event_type, process_status, error, received_at, payload")
    .order("received_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    count: events?.length ?? 0,
    events: (events ?? []).map((e) => ({
      receivedAt: e.received_at,
      eventType: e.event_type,
      status: e.process_status,
      error: e.error,
      providerEventId: e.provider_event_id,
      // the shared webhook secret rides along in the body on some providers —
      // never echo it back, even to an admin
      payload: redact(e.payload),
    })),
  });
}

function redact(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const copy = { ...(payload as Record<string, unknown>) };
  for (const key of ["token", "auth", "authkey", "secret_token", "x-api-key"]) {
    if (key in copy) copy[key] = "[redacted]";
  }
  return copy;
}
