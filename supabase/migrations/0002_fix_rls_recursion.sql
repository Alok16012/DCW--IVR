-- ============================================================================
-- Fix: infinite recursion between calls and call_attempts RLS policies.
-- The calls policy referenced call_attempts and the attempts policy referenced
-- calls, so evaluating either recursed forever. We move the agent-visibility
-- check into a SECURITY DEFINER function (which bypasses RLS internally), so
-- neither policy triggers the other.
-- ============================================================================

create or replace function agent_on_call(p_call_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from calls c
      where c.id = p_call_id
        and (c.connected_agent_id = current_agent_id()
             or c.initiated_by_agent_id = current_agent_id())
    )
    or exists (
      select 1 from call_attempts a
      where a.call_id = p_call_id
        and a.agent_id = current_agent_id()
    );
$$;

-- calls: elevated roles see the whole org; agents see calls they are involved in
drop policy if exists calls_read on calls;
create policy calls_read on calls for select using (
  organization_id = current_org_id() and (
    current_role_name() in ('super_admin','manager','auditor')
    or agent_on_call(id)
  )
);

-- attempts: same rule, via the same helper (no cross-reference to calls policy)
drop policy if exists attempts_read on call_attempts;
create policy attempts_read on call_attempts for select using (
  organization_id = current_org_id() and (
    current_role_name() in ('super_admin','manager','auditor')
    or agent_id = current_agent_id()
    or agent_on_call(call_id)
  )
);
