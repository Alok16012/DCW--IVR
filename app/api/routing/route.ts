import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const ruleSchema = z.object({
  ruleId: z.string().uuid(),
  ring_timeout: z.number().int().min(5).max(120).optional(),
  max_attempts: z.number().int().min(1).max(50).nullable().optional(),
  allow_repeat: z.boolean().optional(),
  mode: z.enum(["sequential", "round_robin"]).optional(),
  fallback_message: z.string().max(500).nullable().optional(),
  after_hours_number: z.string().max(24).nullable().optional(),
  notify_manager_on_miss: z.boolean().optional(),
});

const reorderSchema = z.object({
  ruleId: z.string().uuid(),
  order: z.array(z.object({ agentId: z.string().uuid(), enabled: z.boolean() })),
});

async function authorize() {
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

// Update routing-rule settings (PRD AC-11: no code changes needed).
export async function PATCH(req: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { profile } = auth;

  const parsed = ruleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const db = createAdminClient();
  const { ruleId, ...updates } = parsed.data;
  const { error } = await db
    .from("routing_rules")
    .update(updates)
    .eq("id", ruleId)
    .eq("organization_id", profile.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(db, {
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorName: profile.name,
    action: "routing.update_settings",
    entity: "routing_rule",
    entityId: ruleId,
    newValues: updates,
  });
  return NextResponse.json({ ok: true });
}

// Save the ordered ring sequence + per-agent enabled flags (PRD §9.2 drag order).
export async function POST(req: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const { profile } = auth;

  const parsed = reorderSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const db = createAdminClient();
  const { ruleId, order } = parsed.data;

  // rewrite sequences 1..N and enabled flags
  for (let i = 0; i < order.length; i++) {
    await db
      .from("routing_rule_agents")
      .update({ sequence: i + 1, enabled: order[i].enabled })
      .eq("rule_id", ruleId)
      .eq("agent_id", order[i].agentId);
  }

  await logAudit(db, {
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorName: profile.name,
    action: "routing.update_order",
    entity: "routing_rule",
    entityId: ruleId,
    newValues: { order: order.map((o, i) => ({ seq: i + 1, agentId: o.agentId, enabled: o.enabled })) },
  });
  return NextResponse.json({ ok: true });
}
