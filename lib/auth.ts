import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Organization } from "@/lib/types";
import type { Role } from "@/lib/status";

export type SessionContext = {
  userId: string;
  profile: Profile;
  organization: Organization;
};

/** Load the signed-in user's profile + org, or redirect to login. */
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/login");

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single();

  return {
    userId: user.id,
    profile: profile as Profile,
    organization: (organization ?? {
      id: profile.organization_id,
      name: "Organization",
      timezone: "Asia/Kolkata",
      settings: {},
      status: "active",
      created_at: new Date().toISOString(),
    }) as Organization,
  };
}

export function canAccess(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}

/** Enforce that the current session role is in the allowed set, else 404-ish redirect. */
export async function requireRole(allowed: Role[]): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!allowed.includes(ctx.profile.role)) redirect("/dashboard");
  return ctx;
}
