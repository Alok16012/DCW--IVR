// Central definitions for call / attempt / callback statuses (PRD §14) and
// their presentation. Keeping this in one place means every screen renders the
// same label + color for a given status.

export type CallStatus =
  | "initiated"
  | "routing"
  | "ringing"
  | "answered"
  | "completed"
  | "missed"
  | "failed"
  | "cancelled";

export type AttemptStatus =
  | "queued"
  | "ringing"
  | "answered"
  | "busy"
  | "rejected"
  | "no_answer"
  | "failed"
  | "skipped"
  | "cancelled";

export type CallbackStatus =
  | "open"
  | "scheduled"
  | "in_progress"
  | "attempted"
  | "resolved"
  | "cancelled";

export type Direction = "inbound" | "outbound";
export type Role = "super_admin" | "manager" | "agent" | "auditor";
export type Availability = "available" | "busy" | "break" | "offline" | "leave";
export type CallbackPriority = "high" | "medium" | "low";
export type Disposition =
  | "connected"
  | "no_answer"
  | "busy"
  | "wrong_number"
  | "follow_up"
  | "resolved"
  | "not_interested";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

export const CALL_STATUS_META: Record<CallStatus, { label: string; tone: Tone }> = {
  initiated: { label: "Initiated", tone: "info" },
  routing: { label: "Routing", tone: "accent" },
  ringing: { label: "Ringing", tone: "accent" },
  answered: { label: "Answered", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  missed: { label: "Missed", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const ATTEMPT_STATUS_META: Record<AttemptStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  ringing: { label: "Ringing", tone: "accent" },
  answered: { label: "Answered", tone: "success" },
  busy: { label: "Busy", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
  no_answer: { label: "No answer", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const CALLBACK_STATUS_META: Record<CallbackStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  in_progress: { label: "In progress", tone: "accent" },
  attempted: { label: "Attempted", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const AVAILABILITY_META: Record<Availability, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "success" },
  busy: { label: "Busy", tone: "warning" },
  break: { label: "Break", tone: "info" },
  offline: { label: "Offline", tone: "neutral" },
  leave: { label: "Leave", tone: "neutral" },
};

export const PRIORITY_META: Record<CallbackPriority, { label: string; tone: Tone }> = {
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "info" },
};

export const DISPOSITION_META: Record<Disposition, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "success" },
  no_answer: { label: "No answer", tone: "danger" },
  busy: { label: "Busy", tone: "warning" },
  wrong_number: { label: "Wrong number", tone: "neutral" },
  follow_up: { label: "Follow up", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  not_interested: { label: "Not interested", tone: "neutral" },
};

export const ROLE_META: Record<Role, { label: string }> = {
  super_admin: { label: "Super Admin" },
  manager: { label: "Manager" },
  agent: { label: "Agent" },
  auditor: { label: "Auditor" },
};

export const DISPOSITION_OPTIONS = Object.keys(DISPOSITION_META) as Disposition[];
export const AVAILABILITY_OPTIONS = Object.keys(AVAILABILITY_META) as Availability[];
