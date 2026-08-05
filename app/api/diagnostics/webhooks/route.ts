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
    .select("role, organization_id")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createAdminClient();
  const [{ data: events }, { data: calls }, { data: orgs }] = await Promise.all([
    db
      .from("webhook_events")
      .select("provider_event_id, event_type, process_status, error, received_at, payload")
      .order("received_at", { ascending: false })
      .limit(20),
    // read with the admin client on purpose: the point is to reveal calls the
    // signed-in admin CANNOT see, e.g. ones recorded under a different org
    db
      .from("calls")
      .select("id, provider_call_id, direction, status, started_at, organization_id, talk_seconds")
      .order("started_at", { ascending: false })
      .limit(10),
    db.from("organizations").select("id, name").order("created_at"),
  ]);

  return NextResponse.json({
    // if a call's organization_id differs from yours, RLS hides it from your
    // dashboard even though it was recorded correctly
    yourOrganizationId: profile.organization_id,
    organizations: orgs ?? [],
    recentCalls: calls ?? [],
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
