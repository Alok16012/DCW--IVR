import type { SupabaseClient } from "@supabase/supabase-js";

/** Append an immutable audit entry (PRD §12 Audit Logs, §18). */
export async function logAudit(
  db: SupabaseClient,
  entry: {
    organizationId: string;
    actorId?: string | null;
    actorName?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  },
) {
  await db.from("audit_logs").insert({
    organization_id: entry.organizationId,
    actor_id: entry.actorId ?? null,
    actor_name: entry.actorName ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    old_values: entry.oldValues ?? null,
    new_values: entry.newValues ?? null,
  });
}
