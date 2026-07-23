/* eslint-disable no-console */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_NAME = "Distance Courses";
const DEFAULT_PASSWORD = "CallRoute@2026";

type SeedUser = {
  email: string;
  name: string;
  role: "super_admin" | "manager" | "agent" | "auditor";
  phone?: string;
  priority?: number;
  team?: string;
  availability?: "available" | "busy" | "break" | "offline" | "leave";
  fallback?: boolean;
};

const USERS: SeedUser[] = [
  { email: "admin@distancecourses.test", name: "Amar Kapian", role: "super_admin" },
  { email: "manager@distancecourses.test", name: "Priya Nair", role: "manager", team: "Admissions" },
  { email: "riya@distancecourses.test", name: "Riya Sharma", role: "agent", phone: "+91 90000 10001", priority: 1, team: "Admissions", availability: "available", fallback: true },
  { email: "arjun@distancecourses.test", name: "Arjun Mehta", role: "agent", phone: "+91 90000 10002", priority: 2, team: "Admissions", availability: "available" },
  { email: "meera@distancecourses.test", name: "Meera Iyer", role: "agent", phone: "+91 90000 10003", priority: 3, team: "Admissions", availability: "available" },
  { email: "rohan@distancecourses.test", name: "Rohan Das", role: "agent", phone: "+91 90000 10004", priority: 4, team: "Support", availability: "break" },
  { email: "sana@distancecourses.test", name: "Sana Khan", role: "agent", phone: "+91 90000 10005", priority: 5, team: "Support", availability: "offline" },
  { email: "auditor@distancecourses.test", name: "Vikram Rao", role: "auditor" },
];

async function ensureUser(email: string, name: string): Promise<string> {
  // try create; if exists, look up
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created?.user) return created.user.id;
  if (error && !/already/i.test(error.message)) throw error;

  // find existing user by paging admin list
  let page = 1;
  for (;;) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
    page++;
  }
  throw new Error(`Could not create or find user ${email}`);
}

async function wipeOrgData(orgId: string) {
  // delete in FK-safe order (children first)
  const tables = [
    "audit_logs",
    "webhook_events",
    "call_notes",
    "recordings",
    "call_attempts",
    "callbacks",
    "calls",
    "routing_rule_agents",
    "business_numbers",
    "routing_rules",
    "agents",
    "holidays",
    "business_hours",
    "teams",
  ];
  for (const t of tables) {
    await db.from(t).delete().eq("organization_id", orgId);
  }
}

function iso(daysAgo: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function main() {
  console.log("Seeding organization:", ORG_NAME);

  // ---- organization ----
  let { data: org } = await db.from("organizations").select("*").eq("name", ORG_NAME).maybeSingle();
  if (!org) {
    const res = await db
      .from("organizations")
      .insert({ name: ORG_NAME, timezone: "Asia/Kolkata" })
      .select("*")
      .single();
    org = res.data!;
  }
  const orgId = org.id as string;

  await wipeOrgData(orgId);

  // ---- teams ----
  const teamNames = ["Admissions", "Support"];
  const teamIds: Record<string, string> = {};
  for (const name of teamNames) {
    const { data } = await db
      .from("teams")
      .insert({ organization_id: orgId, name })
      .select("id")
      .single();
    teamIds[name] = data!.id;
  }

  // ---- auth users + profiles ----
  const profileIds: Record<string, string> = {};
  for (const u of USERS) {
    const userId = await ensureUser(u.email, u.name);
    // upsert profile
    const { data: existing } = await db.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (existing) {
      await db
        .from("profiles")
        .update({ organization_id: orgId, name: u.name, email: u.email, role: u.role, status: "active" })
        .eq("id", existing.id);
      profileIds[u.email] = existing.id;
    } else {
      const { data } = await db
        .from("profiles")
        .insert({ user_id: userId, organization_id: orgId, name: u.name, email: u.email, role: u.role })
        .select("id")
        .single();
      profileIds[u.email] = data!.id;
    }
  }

  // ---- agents (only agent-role users) ----
  const agentIds: Record<string, string> = {};
  for (const u of USERS.filter((x) => x.role === "agent")) {
    const { data } = await db
      .from("agents")
      .insert({
        organization_id: orgId,
        profile_id: profileIds[u.email],
        name: u.name,
        email: u.email,
        employee_code: `EMP-${u.priority}`,
        phone: u.phone!,
        phone_verified: true,
        team_id: teamIds[u.team ?? "Admissions"],
        priority: u.priority ?? 100,
        ring_timeout: 20,
        availability: u.availability ?? "offline",
        shift_start: "09:00",
        shift_end: "18:00",
        fallback_owner: u.fallback ?? false,
        active: u.email !== "sana@distancecourses.test" ? true : true,
      })
      .select("id")
      .single();
    agentIds[u.name] = data!.id;
  }

  // ---- routing rule + ordered agents ----
  const { data: rule } = await db
    .from("routing_rules")
    .insert({
      organization_id: orgId,
      name: "Primary sequential",
      mode: "sequential",
      ring_timeout: 20,
      max_attempts: null,
      allow_repeat: false,
      fallback_message: "Our team is currently busy. We will call you back shortly.",
      notify_manager_on_miss: true,
      active: true,
    })
    .select("id")
    .single();
  const ruleId = rule!.id;

  const orderedAgents = USERS.filter((x) => x.role === "agent").sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  let seq = 1;
  for (const u of orderedAgents) {
    await db.from("routing_rule_agents").insert({
      rule_id: ruleId,
      agent_id: agentIds[u.name],
      sequence: seq++,
      enabled: true,
    });
  }

  // ---- business number ----
  await db.from("business_numbers").insert({
    organization_id: orgId,
    number: "+91 80 4567 8900",
    label: "Main line",
    routing_rule_id: ruleId,
    status: "active",
  });

  // ---- business hours (Mon–Sat 9–18) ----
  for (let d = 0; d <= 6; d++) {
    await db.from("business_hours").insert({
      organization_id: orgId,
      day_of_week: d,
      open_time: "09:00",
      close_time: "18:00",
      enabled: d !== 0, // closed Sundays
    });
  }

  // ---- holiday example ----
  const holiday = new Date();
  holiday.setDate(holiday.getDate() + 14);
  await db.from("holidays").insert({
    organization_id: orgId,
    holiday_date: holiday.toISOString().slice(0, 10),
    label: "Founder's Day",
    fallback_rule: "callback",
  });

  // ---- historical calls (7 days) so every screen has content ----
  await seedHistoricalCalls(orgId, ruleId, agentIds, teamIds, profileIds);

  // ---- audit trail examples ----
  await db.from("audit_logs").insert([
    {
      organization_id: orgId,
      actor_id: profileIds["admin@distancecourses.test"],
      actor_name: "Amar Kapian",
      action: "routing.update_order",
      entity: "routing_rule",
      entity_id: ruleId,
      new_values: { order: orderedAgents.map((a) => a.name) },
      created_at: iso(2, 11),
    },
    {
      organization_id: orgId,
      actor_id: profileIds["admin@distancecourses.test"],
      actor_name: "Amar Kapian",
      action: "settings.update_office_hours",
      entity: "business_hours",
      new_values: { open: "09:00", close: "18:00" },
      created_at: iso(1, 9, 30),
    },
  ]);

  console.log("\n✅ Seed complete.\n");
  console.log("Login credentials (password for all):", DEFAULT_PASSWORD);
  console.table(USERS.map((u) => ({ role: u.role, email: u.email })));
}

async function seedHistoricalCalls(
  orgId: string,
  ruleId: string,
  agentIds: Record<string, string>,
  teamIds: Record<string, string>,
  profileIds: Record<string, string>,
) {
  const agentNames = Object.keys(agentIds);
  const callers = [
    "+91 98765 43210", "+91 91234 56789", "+91 99887 66554", "+91 77654 32109",
    "+91 99001 23456", "+91 98345 67890", "+91 96112 33445", "+91 97400 55667",
    "+91 95388 77665", "+91 90011 22334", "+91 93456 11223", "+91 94123 99887",
  ];

  let callerIdx = 0;
  const nextCaller = () => callers[callerIdx++ % callers.length];

  // generate ~48 calls across the last 7 days
  for (let day = 6; day >= 0; day--) {
    const perDay = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < perDay; i++) {
      const hour = 9 + Math.floor(Math.random() * 9);
      const minute = Math.floor(Math.random() * 60);
      const direction = Math.random() < 0.72 ? "inbound" : "outbound";
      const caller = nextCaller();

      if (direction === "outbound") {
        const initiator = agentNames[Math.floor(Math.random() * agentNames.length)];
        const connected = Math.random() > 0.2;
        const talk = connected ? 40 + Math.floor(Math.random() * 220) : 0;
        const { data: call } = await db
          .from("calls")
          .insert({
            organization_id: orgId,
            provider_call_id: `seed-out-${randomUUID().slice(0, 10)}`,
            direction: "outbound",
            caller: "+91 90000 1000" + (1 + Math.floor(Math.random() * 5)),
            destination: caller,
            status: connected ? "completed" : "failed",
            routing_rule_id: ruleId,
            connected_agent_id: connected ? agentIds[initiator] : null,
            initiated_by_agent_id: agentIds[initiator],
            attempts_count: 1,
            talk_seconds: talk,
            started_at: iso(day, hour, minute),
            connected_at: connected ? iso(day, hour, minute) : null,
            ended_at: iso(day, hour, minute + 4),
          })
          .select("id")
          .single();
        if (connected && Math.random() > 0.5) {
          await db.from("recordings").insert({
            organization_id: orgId,
            call_id: call!.id,
            provider_ref: `rec/${randomUUID().slice(0, 12)}`,
            duration: talk,
          });
        }
        continue;
      }

      // inbound journey: ring 1..N agents until answer or miss
      const answeredAtSeq = Math.random() < 0.85 ? 1 + Math.floor(Math.random() * 3) : 99;
      const maxSeq = Math.min(answeredAtSeq, agentNames.length);
      const answered = answeredAtSeq <= agentNames.length;
      const talk = answered ? 45 + Math.floor(Math.random() * 260) : 0;
      const connectedAgentName = answered ? agentNames[(maxSeq - 1) % agentNames.length] : null;

      const { data: call } = await db
        .from("calls")
        .insert({
          organization_id: orgId,
          provider_call_id: `seed-in-${randomUUID().slice(0, 10)}`,
          direction: "inbound",
          caller,
          destination: "+91 80 4567 8900",
          status: answered ? "completed" : "missed",
          routing_rule_id: ruleId,
          connected_agent_id: connectedAgentName ? agentIds[connectedAgentName] : null,
          attempts_count: answered ? maxSeq : agentNames.length,
          talk_seconds: talk,
          started_at: iso(day, hour, minute),
          connected_at: answered ? iso(day, hour, minute) : null,
          ended_at: iso(day, hour, minute + 5),
        })
        .select("id")
        .single();

      const totalAttempts = answered ? maxSeq : agentNames.length;
      for (let s = 1; s <= totalAttempts; s++) {
        const agentName = agentNames[(s - 1) % agentNames.length];
        const isLast = s === totalAttempts;
        const status = answered && isLast ? "answered" : Math.random() > 0.5 ? "no_answer" : "busy";
        await db.from("call_attempts").insert({
          organization_id: orgId,
          call_id: call!.id,
          agent_id: agentIds[agentName],
          sequence: s,
          status,
          ring_seconds: 8 + Math.floor(Math.random() * 14),
          started_at: iso(day, hour, minute),
          ended_at: iso(day, hour, minute + 1),
        });
      }

      if (answered) {
        if (Math.random() > 0.4) {
          await db.from("recordings").insert({
            organization_id: orgId,
            call_id: call!.id,
            provider_ref: `rec/${randomUUID().slice(0, 12)}`,
            duration: talk,
          });
        }
        if (Math.random() > 0.6) {
          await db.from("call_notes").insert({
            organization_id: orgId,
            call_id: call!.id,
            author_id: profileIds["manager@distancecourses.test"],
            note: "Customer enquired about the distance MBA program fee structure.",
            disposition: "resolved",
            tags: ["enquiry", "admissions"],
          });
        }
      } else {
        // missed → one callback (mirror engine behavior)
        await db.from("callbacks").insert({
          organization_id: orgId,
          call_id: call!.id,
          caller,
          owner_agent_id: agentIds["Riya Sharma"],
          team_id: teamIds["Admissions"],
          priority: Math.random() > 0.6 ? "high" : Math.random() > 0.4 ? "medium" : "low",
          status: day <= 1 ? "open" : Math.random() > 0.5 ? "resolved" : "open",
          due_at: iso(day, hour + 1, minute),
          attempts: Math.floor(Math.random() * 2),
        });
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
