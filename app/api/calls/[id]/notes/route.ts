import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DISPOSITION_OPTIONS } from "@/lib/status";

const schema = z.object({
  note: z.string().max(2000).optional(),
  disposition: z.enum(DISPOSITION_OPTIONS as [string, ...string[]]).optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
});

// Add a note / disposition to a call (PRD §9.3). Provider-derived call facts
// stay immutable — only notes/disposition/tags are editable, and they are added
// as new call_notes rows, never overwriting the call record.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  if (!parsed.data.note && !parsed.data.disposition) {
    return NextResponse.json({ error: "note or disposition required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const { error } = await supabase.from("call_notes").insert({
    organization_id: profile.organization_id,
    call_id: id,
    author_id: profile.id,
    note: parsed.data.note ?? null,
    disposition: parsed.data.disposition ?? null,
    tags: parsed.data.tags ?? [],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
