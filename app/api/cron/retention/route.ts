import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/cron";
import { logAudit } from "@/lib/audit";

// Retention enforcement (PRD §18 "Define retention periods for call logs and
// recordings; delete or archive according to client policy"). Only acts when an
// org has an explicit `retention_days` in its settings — otherwise no-op, so it
// never deletes data unless the client opted in. Deletion cascades to attempts,
// notes and recordings via FK ON DELETE CASCADE.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const db = createAdminClient();
  const { data: orgs } = await db.from("organizations").select("id, name, settings");

  const results: { org: string; deleted: number }[] = [];

  for (const org of orgs ?? []) {
    const days = Number((org.settings as Record<string, unknown>)?.retention_days ?? 0);
    if (!days || days <= 0) continue;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data: old } = await db
      .from("calls")
      .select("id")
      .eq("organization_id", org.id)
      .lt("started_at", cutoff.toISOString())
      .limit(500);

    const ids = (old ?? []).map((c) => c.id);
    if (ids.length === 0) continue;

    await db.from("calls").delete().in("id", ids);
    await logAudit(db, {
      organizationId: org.id,
      actorName: "system:retention",
      action: "retention.purge_calls",
      entity: "calls",
      newValues: { deleted: ids.length, olderThanDays: days },
    });
    results.push({ org: org.name, deleted: ids.length });
  }

  return NextResponse.json({ ok: true, results });
}
