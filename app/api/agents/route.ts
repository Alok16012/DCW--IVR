import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { AVAILABILITY_OPTIONS } from "@/lib/status";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  employee_code: z.string().max(40).optional().or(z.literal("")),
  phone: z.string().min(6).max(24),
  team_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(1).max(999),
  ring_timeout: z.number().int().min(5).max(120),
  availability: z.enum(AVAILABILITY_OPTIONS as [string, ...string[]]),
  shift_start: z.string().optional().or(z.literal("")),
  shift_end: z.string().optional().or(z.literal("")),
  fallback_owner: z.boolean(),
  active: z.boolean(),
});

async function authorize(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, name, role")
    .eq("user_id", user.id)
    .single();
  if (!profile || !["super_admin", "manager"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { profile };
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (auth.error) return auth.error;
  const { profile } = auth;

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }
  const db = createAdminClient();
  const p = parsed.data;

  const row = {
    organization_id: profile.organization_id,
    name: p.name,
    email: p.email || null,
    employee_code: p.employee_code || null,
    phone: p.phone,
    phone_verified: true,
    team_id: p.team_id || null,
    priority: p.priority,
    ring_timeout: p.ring_timeout,
    availability: p.availability,
    shift_start: p.shift_start || null,
    shift_end: p.shift_end || null,
    fallback_owner: p.fallback_owner,
    active: p.active,
    updated_at: new Date().toISOString(),
  };

  if (p.id) {
    const { error } = await db.from("agents").update(row).eq("id", p.id).eq("organization_id", profile.organization_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(db, {
      organizationId: profile.organization_id,
      actorId: profile.id,
      actorName: profile.name,
      action: "agent.update",
      entity: "agent",
      entityId: p.id,
      newValues: row,
    });
    return NextResponse.json({ ok: true, id: p.id });
  }

  const { data, error } = await db.from("agents").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // add to the primary routing rule at the end of the sequence
  const { data: rule } = await db
    .from("routing_rules")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (rule) {
    const { data: maxSeq } = await db
      .from("routing_rule_agents")
      .select("sequence")
      .eq("rule_id", rule.id)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    await db.from("routing_rule_agents").insert({
      rule_id: rule.id,
      agent_id: data!.id,
      sequence: (maxSeq?.sequence ?? 0) + 1,
      enabled: true,
    });
  }

  await logAudit(db, {
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorName: profile.name,
    action: "agent.create",
    entity: "agent",
    entityId: data!.id,
    newValues: row,
  });
  return NextResponse.json({ ok: true, id: data!.id });
}
