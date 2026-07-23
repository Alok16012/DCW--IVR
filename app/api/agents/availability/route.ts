import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AVAILABILITY_OPTIONS } from "@/lib/status";

const schema = z.object({
  agentId: z.string().uuid(),
  availability: z.enum(AVAILABILITY_OPTIONS as [string, ...string[]]),
});

// Set agent availability. Managers/admins can set anyone; an agent can set their
// own (enforced by RLS agents_self_update policy).
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const { error } = await supabase
    .from("agents")
    .update({ availability: parsed.data.availability, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.agentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
