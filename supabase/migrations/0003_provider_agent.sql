-- Provider-supplied agent identity on calls.
--
-- When the telephony provider runs its own IVR and hunting (Buzzdial), the
-- agent who took the call may not exist in our agents table — the call then
-- has no connected_agent_id and the UI shows no agent at all. Keep what the
-- provider told us so the call log/reports can still name the agent, and so an
-- agent added later can be reconciled by phone number.

alter table calls add column if not exists provider_agent_name text;
alter table calls add column if not exists provider_agent_phone text;

create index if not exists calls_provider_agent_phone_idx on calls (provider_agent_phone);
