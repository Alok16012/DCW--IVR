import type {
  AttemptStatus,
  Availability,
  CallStatus,
  CallbackPriority,
  CallbackStatus,
  Direction,
  Disposition,
  Role,
} from "./status";

export type Organization = {
  id: string;
  name: string;
  timezone: string;
  settings: Record<string, unknown>;
  status: string;
  created_at: string;
};

export type Profile = {
  id: string;
  user_id: string | null;
  organization_id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  created_at: string;
};

export type Team = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  created_at: string;
};

export type Agent = {
  id: string;
  organization_id: string;
  profile_id: string | null;
  name: string;
  email: string | null;
  employee_code: string | null;
  phone: string;
  phone_verified: boolean;
  team_id: string | null;
  priority: number;
  ring_timeout: number;
  availability: Availability;
  shift_start: string | null;
  shift_end: string | null;
  fallback_owner: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RoutingMode = "sequential" | "round_robin";

export type RoutingRule = {
  id: string;
  organization_id: string;
  name: string;
  mode: RoutingMode;
  ring_timeout: number;
  max_attempts: number | null;
  allow_repeat: boolean;
  fallback_message: string | null;
  after_hours_number: string | null;
  notify_manager_on_miss: boolean;
  active: boolean;
  created_at: string;
};

export type RoutingRuleAgent = {
  id: string;
  rule_id: string;
  agent_id: string;
  sequence: number;
  enabled: boolean;
  timeout_override: number | null;
};

export type BusinessNumber = {
  id: string;
  organization_id: string;
  number: string;
  label: string | null;
  routing_rule_id: string | null;
  status: string;
  created_at: string;
};

export type Call = {
  id: string;
  organization_id: string;
  provider_call_id: string | null;
  direction: Direction;
  caller: string;
  destination: string | null;
  business_number_id: string | null;
  routing_rule_id: string | null;
  status: CallStatus;
  connected_agent_id: string | null;
  initiated_by_agent_id: string | null;
  attempts_count: number;
  talk_seconds: number;
  started_at: string;
  connected_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type CallAttempt = {
  id: string;
  organization_id: string;
  call_id: string;
  agent_id: string | null;
  sequence: number;
  provider_leg_id: string | null;
  status: AttemptStatus;
  ring_seconds: number | null;
  started_at: string;
  ended_at: string | null;
};

export type Recording = {
  id: string;
  organization_id: string;
  call_id: string;
  provider_ref: string | null;
  duration: number | null;
  access_meta: Record<string, unknown>;
  created_at: string;
};

export type CallNote = {
  id: string;
  organization_id: string;
  call_id: string;
  author_id: string | null;
  note: string | null;
  disposition: Disposition | null;
  tags: string[];
  created_at: string;
};

export type Callback = {
  id: string;
  organization_id: string;
  call_id: string | null;
  caller: string;
  owner_agent_id: string | null;
  team_id: string | null;
  priority: CallbackPriority;
  status: CallbackStatus;
  due_at: string;
  attempts: number;
  outcome: Disposition | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessHour = {
  id: string;
  organization_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  enabled: boolean;
};

export type Holiday = {
  id: string;
  organization_id: string;
  holiday_date: string;
  label: string | null;
  fallback_rule: string | null;
};

export type AuditLog = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

/** Agent joined with its live-status derived fields, used in dashboards. */
export type AgentWithStats = Agent & {
  team_name?: string | null;
};
