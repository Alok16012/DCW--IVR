import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  organization: z
    .object({ name: z.string().min(1).max(120).optional(), timezone: z.string().max(64).optional() })
    .optional(),
  businessHours: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        open_time: z.string(),
        close_time: z.string(),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

async function authorizeAdmin() {
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
  if (!profile || profile.role !== "super_admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { profile };
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeAdmin();
  if (auth.error) return auth.error;
  const { profile } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const db = createAdminClient();
  const orgId = profile.organization_id;

  if (parsed.data.organization) {
    await db.from("organizations").update(parsed.data.organization).eq("id", orgId);
  }
  if (parsed.data.settings) {
    const { data: org } = await db.from("organizations").select("settings").eq("id", orgId).single();
    await db
      .from("organizations")
      .update({ settings: { ...(org?.settings ?? {}), ...parsed.data.settings } })
      .eq("id", orgId);
  }
  if (parsed.data.businessHours) {
    for (const h of parsed.data.businessHours) {
      await db
        .from("business_hours")
        .upsert(
          { organization_id: orgId, ...h },
          { onConflict: "organization_id,day_of_week" },
        );
    }
  }

  await logAudit(db, {
    organizationId: orgId,
    actorId: profile.id,
    actorName: profile.name,
    action: "settings.update",
    entity: "organization",
    entityId: orgId,
    newValues: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
