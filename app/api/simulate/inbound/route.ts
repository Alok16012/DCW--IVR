import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCallJourney } from "@/lib/routing/engine";

// Simulate an inbound customer call arriving on the business number. Uses the
// mock provider path end-to-end so the journey, attempts, and callbacks are all
// real rows — this is the local stand-in for a real Exotel inbound webhook.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { caller?: string; businessNumberId?: string };
  const caller = body.caller || randomIndianNumber();

  const db = createAdminClient();
  const { data: bn } = await db
    .from("business_numbers")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .limit(1)
    .maybeSingle();

  const result = await startCallJourney(db, {
    organizationId: profile.organization_id,
    caller,
    businessNumberId: body.businessNumberId ?? bn?.id ?? null,
    providerCallId: `mock-${randomUUID().slice(0, 12)}`,
  });

  return NextResponse.json(result);
}

function randomIndianNumber(): string {
  const n = Math.floor(6000000000 + Math.random() * 3999999999);
  return `+91 ${String(n).slice(0, 5)} ${String(n).slice(5)}`;
}
