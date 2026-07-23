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
active by default (drives the full engine with no external account) and an **Exotel**
adapter is code-complete for when a live account is provisioned.

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

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run db:migrate` — apply SQL migrations (requires `SUPABASE_DB_URL`)
- `npm run db:seed` — seed demo data
- `npm run db:setup` — migrate then seed
