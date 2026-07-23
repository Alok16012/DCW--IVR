import { Suspense } from "react";
import { Brand } from "@/components/Brand";
import { BlinksAiFooter } from "@/components/BlinksAiFooter";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* left: brand / marketing panel */}
      <div className="relative hidden overflow-hidden border-r border-[var(--border)] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_20%_10%,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Brand />
          <div className="max-w-md space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              DCW · Distance Courses Wala
            </p>
            <h1 className="text-3xl font-bold leading-tight text-[var(--text)]">
              Never miss a customer call again.
            </h1>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              Automatic sequential routing rings your agents in priority order, fails over
              instantly, and turns every unanswered call into a tracked callback — with live
              operations, agent performance, and reports in one dashboard.
            </p>
            <ul className="space-y-2.5 text-sm text-[var(--text-muted)]">
              {[
                "Sequential agent ringing with automatic failover",
                "Live call routing & complete attempt timeline",
                "Missed-call callback queue and assignment",
                "Agent-wise performance, answer rate & talk time",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <BlinksAiFooter className="justify-start !text-left" />
        </div>
      </div>

      {/* right: form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text)]">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Welcome back. Enter your credentials to access the dashboard.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
          <BlinksAiFooter className="mt-8 lg:hidden" />
        </div>
      </div>
    </div>
  );
}
