"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea, Select, Field } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { DISPOSITION_META, DISPOSITION_OPTIONS } from "@/lib/status";

export function NotesEditor({ callId }: { callId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [disposition, setDisposition] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!note.trim() && !disposition) {
      toast("Add a note or select a disposition first.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/calls/${callId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          disposition: disposition || undefined,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast("Note saved.", "success");
      setNote("");
      setDisposition("");
      setTags("");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 p-5">
      <Field label="Disposition" htmlFor="disp">
        <Select id="disp" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="">Select outcome…</option>
          {DISPOSITION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DISPOSITION_META[d].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" htmlFor="note">
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context about this call…"
        />
      </Field>
      <Field label="Tags" htmlFor="tags" hint="Comma-separated">
        <Textarea
          id="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="enquiry, admissions"
          className="min-h-0 h-10 py-2"
        />
      </Field>
      <Button onClick={save} loading={loading} className="w-full">
        <MessageSquarePlus className="size-4" /> Save note
      </Button>
    </div>
  );
}
