# DCW-IVR — Automatic Call Routing & Tracking System

A cloud call-operations dashboard for **Distance Courses Wala (DCW)**: customers call one
business number, the system rings agents in a configured priority order with automatic
failover, and every call, agent, and missed-call callback is tracked in a secure,
role-aware dashboard.

Built by **Blinks AI**.

## Features

- **Sequential routing engine** — priority ring order, configurable ring timeout,
  answer-lock, max-attempts, repeat prevention, concurrency skip, office-hours/holiday
  fallback, and automatic one-callback-per-missed-journey.
- **Live call routing panel** — watch a call ring agent → agent in real time.
- **Unified call log & detail** — full attempt-by-attempt timeline, dispositions, notes,
  recording references.
- **Agents** — CRUD, drag-and-drop priority, shifts, availability, per-agent ring timeout.
- **Routing config** — reorder, timeouts, eligibility, office hours, fallback (no code
  changes needed).
- **Callbacks** — pending / overdue / assigned / resolved with click-to-call.
- **Reports** — agent-wise performance with the call-journey-vs-attempt distinction kept
  separate, plus CSV export.
- **Settings & Audit logs**, role-based access (Super Admin / Manager / Agent / Auditor)
  enforced by Postgres Row-Level Security **and** UI guards.

## Tech stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Postgres + Auth + RLS) ·
Recharts · Zod · dnd-kit. Telephony sits behind a provider adapter: a **Mock** provider is
active by default (drives the full engine with no external account), and **Exotel**,
**Buzzdial** and **MyOperator** adapters are code-complete for when a live account is
provisioned.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
```

### Database

1. Apply the schema — run `supabase/migrations/0001_init.sql` then
   `supabase/migrations/0002_fix_rls_recursion.sql` in the Supabase SQL Editor
   (or set `SUPABASE_DB_URL` in `.env.local` and run `npm run db:migrate`).
2. Seed demo data (organization, agents, routing rule, sample calls, demo users):

   ```bash
   npm run db:seed
   ```

### Run

```bash
npm run dev
```

Open http://localhost:3000. Demo accounts (password `CallRoute@2026`):

| Role        | Email                          |
| ----------- | ------------------------------ |
| Super Admin | admin@distancecourses.test     |
| Manager     | manager@distancecourses.test   |
| Agent       | riya@distancecourses.test      |
| Auditor     | auditor@distancecourses.test   |

## Going live with Exotel

Set `TELEPHONY_PROVIDER=exotel` and add the `EXOTEL_*` credentials. Routing, reporting,
and callbacks are unchanged — only the call transport switches. Validate leg-transfer
behavior with a provider proof-of-concept before production (see PRD §23).

## Going live with Buzzdial

Set `TELEPHONY_PROVIDER=buzzdial` and add the `BUZZDIAL_*` credentials from `.env.example`.

With Buzzdial, the **inbound IVR flow lives in the Buzzdial portal**, not in this app:
greetings, keypress extensions, hunt strategy (sequence/random), sticky agent,
escalate & busy sound, holiday hours, and voicemail are all configured under
**IVR Settings**. This app drives outbound click-to-call via Buzzdial's C2C API and
ingests inbound call events via Buzzdial **Triggers**.

Portal setup:

1. **IVR number** — share your number with Buzzdial support (support@datagenit.com) or
   convert your business number by diverting calls to your Buzzdial number.
2. **IVR Settings** — configure Call Flow (hunt strategy, sticky agent), Agents
   (same phone numbers as the agents in this app), Sound Audio, and SMS templates.
3. **Trigger → API Trigger** — add a trigger so call events reach this app:
   - Method: `POST`, Event: `All`
   - API URL: `https://YOUR-DEPLOYMENT/api/webhooks/telephony`
   - Parameter setup: map `call_id`, `cust_no`, `agent_no`, `call_type` /`event`,
     `duration`, `recording` — plus an extra param `token` set to the same value as
     `BUZZDIAL_WEBHOOK_SECRET` (this authenticates deliveries; without it, unauthenticated
     posts are rejected in production).
4. **Auth key** — copy from My Account → My Profile → Authkey into `BUZZDIAL_AUTH_KEY`.
5. **Call masking (optional)** — rent a DID from your account manager and set
   `BUZZDIAL_DID_NUMBER` to enable the masking API.

Event mapping: Buzzdial `received` → answered (with duration → completed),
`miscall` → missed (creates a callback via the normal engine path).

**Recordings:** Buzzdial's API Trigger parameter list offers no recording field
(Caller/Called Number, Call Start/End Time, Agent Name/Number, Agent Answer
Time, Keypress, Extension, Duration, Call ID — that is the whole list), so
recordings never arrive on the webhook. To play them in the app, open the
portal's Reports page, copy a recording link, replace the call id with
`{call_id}` and set it as `BUZZDIAL_RECORDING_URL_TEMPLATE`. Answered calls then
get a playable recording; without the template the app simply reports none.

## Going live with MyOperator

Set `TELEPHONY_PROVIDER=myoperator` and add the `MYOPERATOR_*` credentials from
`.env.example`.

As with Buzzdial, **the IVR call flow lives in the MyOperator panel, not in this
app** — menus, greetings/audio, department hunting order, sticky agent, office
hours and voicemail are all dashboard-only; MyOperator publishes no API to
create or edit them. What the API does give us is click-to-call, agent lookup,
call logs, recordings, and a much richer webhook feed than Buzzdial: v2 events
carry a per-leg `legs[]` array, so ring durations and per-agent dial results are
real data rather than guesses.

Panel setup:

1. **Credentials** — APIs & Webhooks → Developer API → Calling APIs gives
   `Company ID` (`MYOPERATOR_COMPANY_ID`), `x-api-key` (`MYOPERATOR_API_KEY`)
   and `Authentication` (`MYOPERATOR_SECRET_TOKEN`).
2. **Public IVR ID** — Call → Outgoing → Campaigns → Create New (a peer-to-peer
   campaign) mints the id that OBD calls require (`MYOPERATOR_PUBLIC_IVR_ID`).
3. **Webhook** — APIs & Webhooks → Webhooks → **v2** → Add Webhook:
   - URL: `https://YOUR-DEPLOYMENT/api/webhooks/telephony`
   - Events: `call.initiated`, `call.dial_begin`, `call.answered`, `call.end`,
     `call.summary`
   - Auth: **API Key**, header name `x-webhook-token`, value =
     `MYOPERATOR_WEBHOOK_SECRET`
4. **Agents** — add the same people (and phone numbers) that exist on the app's
   Agents page, so calls attribute to the right agent.

Event mapping: `call.end`/`call.summary` with status `bridged` → completed;
`missed`/`voicemail` → missed (creates a callback). `call.end` completes the
call, and `call.summary` — the only event carrying the agent's name — arrives
afterwards and is patched onto the same call.

Two things to know: MyOperator sends `recording_filename`, not a URL (exchange
it via `GET /search/recordings/link`, valid 24h), and a non-2xx response puts a
delivery into a 26-attempt / 24-hour retry loop, which is why the webhook route
acknowledges events it doesn't model.

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run db:migrate` — apply SQL migrations (requires `SUPABASE_DB_URL`)
- `npm run db:seed` — seed demo data
- `npm run db:setup` — migrate then seed
