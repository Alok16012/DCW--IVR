import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Agent, Callback } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { CallbacksBoard, type CallbackRow } from "@/components/callbacks/CallbacksBoard";

export default async function CallbacksPage() {
  const { profile } = await requireRole(["super_admin", "manager", "agent"]);
  const supabase = await createClient();

  const [{ data: callbacks }, { data: agents }] = await Promise.all([
    supabase.from("callbacks").select("*").order("due_at"),
    supabase.from("agents").select("id, name").order("name"),
  ]);

  const agentList = (agents ?? []) as Pick<Agent, "id" | "name">[];
  const agentName = new Map(agentList.map((a) => [a.id, a.name]));
  const now = Date.now();

  const rows: CallbackRow[] = ((callbacks ?? []) as Callback[]).map((cb) => ({
    id: cb.id,
    caller: cb.caller,
    priority: cb.priority,
    status: cb.status,
    due_at: cb.due_at,
    attempts: cb.attempts,
    owner_agent_id: cb.owner_agent_id,
    owner_name: cb.owner_agent_id ? agentName.get(cb.owner_agent_id) ?? null : null,
    overdue: new Date(cb.due_at).getTime() < now,
  }));

  const canManage = ["super_admin", "manager"].includes(profile.role);
  const canCall = ["super_admin", "manager", "agent"].includes(profile.role);
  const mask = profile.role === "auditor";

  return (
    <div>
      <PageHeader
        eyebrow="Follow-ups"
        title="Callbacks"
        subtitle="Every missed call becomes a trackable callback. Call, disposition, and resolve from here."
      />
      <CallbacksBoard callbacks={rows} agents={agentList} canManage={canManage} canCall={canCall} mask={mask} />
    </div>
  );
}
