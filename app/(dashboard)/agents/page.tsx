import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Agent, Team } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { AgentsManager } from "@/components/agents/AgentsManager";

export default async function AgentsPage() {
  const { profile } = await requireRole(["super_admin", "manager", "auditor"]);
  const supabase = await createClient();

  const [{ data: agents }, { data: teams }] = await Promise.all([
    supabase.from("agents").select("*").order("priority"),
    supabase.from("teams").select("*").order("name"),
  ]);

  const teamList = (teams ?? []) as Team[];
  const teamName = new Map(teamList.map((t) => [t.id, t.name]));
  const agentList = ((agents ?? []) as Agent[]).map((a) => ({
    ...a,
    team_name: a.team_id ? teamName.get(a.team_id) ?? null : null,
  }));

  const canEdit = ["super_admin", "manager"].includes(profile.role);
  const mask = profile.role === "auditor";

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Agents"
        subtitle="Manage agents, priority order, shifts, availability and routing eligibility."
      />
      <AgentsManager agents={agentList} teams={teamList} canEdit={canEdit} mask={mask} />
    </div>
  );
}
