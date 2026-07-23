import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/telephony";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { BlinksAiFooter } from "@/components/BlinksAiFooter";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const [{ count: callbackCount }, { count: callsCount }, { data: bn }] = await Promise.all([
    supabase
      .from("callbacks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "scheduled", "in_progress", "attempted"]),
    supabase.from("calls").select("id", { count: "exact", head: true }).eq("status", "ringing"),
    supabase.from("business_numbers").select("number").limit(1).maybeSingle(),
  ]);

  const badges = { callbacks: callbackCount ?? 0, calls: callsCount ?? 0 };
  const providerLive = getProvider().live;
  const canCallOut = ["super_admin", "manager", "agent"].includes(profile.role);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={profile.role} badges={badges} providerLive={providerLive} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={profile.name}
          role={profile.role}
          businessNumber={bn?.number ?? "—"}
          canCallOut={canCallOut}
          callbackBadge={badges.callbacks}
        />
        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        <div className="border-t border-[var(--border)] px-4 py-5 lg:px-8">
          <BlinksAiFooter />
        </div>
      </div>
    </div>
  );
}
