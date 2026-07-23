import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DISPOSITION_OPTIONS } from "@/lib/status";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "scheduled", "in_progress", "attempted", "resolved", "cancelled"]).optional(),
  owner_agent_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  outcome: z.enum(DISPOSITION_OPTIONS as [string, ...string[]]).nullable().optional(),
  notes: z.string().max(1000).optional(),
  due_at: z.string().optional(),
});

const createSchema = z.object({
  callId: z.string().uuid().optional(),
  caller: z.string().min(6).max(24),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  owner_agent_id: z.string().uuid().nullable().optional(),
  due_at: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// Create a manual callback from any call (PRD §9.4).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const { error } = await supabase.from("callbacks").insert({
    organization_id: profile.organization_id,
    call_id: parsed.data.callId ?? null,
    caller: parsed.data.caller,
    priority: parsed.data.priority,
    owner_agent_id: parsed.data.owner_agent_id ?? null,
    due_at: parsed.data.due_at ?? new Date().toISOString(),
    notes: parsed.data.notes ?? null,
    status: "open",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Update a callback: status, owner (reassignment), priority, disposition, notes.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const { id, ...updates } = parsed.data;
  const { error } = await supabase
    .from("callbacks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
