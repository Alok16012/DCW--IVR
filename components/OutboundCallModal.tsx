"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneOutgoing } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function OutboundCallModal({
  open,
  onClose,
  presetNumber,
  callbackId,
}: {
  open: boolean;
  onClose: () => void;
  presetNumber?: string;
  callbackId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [number, setNumber] = useState(presetNumber ?? "");
  const [loading, setLoading] = useState(false);

  async function placeCall() {
    if (!number.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNumber: number.trim(), callbackId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Call failed");
      toast(
        data.connected
          ? `Connected to ${number}. Call logged and attributed to you.`
          : `Call to ${number} did not connect — logged as attempt.`,
        data.connected ? "success" : "info",
      );
      onClose();
      setNumber("");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start outbound call"
      description="Tracked click-to-call. The completed call is attributed to you and appears in reports."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={placeCall} loading={loading}>
            <PhoneOutgoing className="size-4" /> Place call
          </Button>
        </>
      }
    >
      <Field label="Customer number" htmlFor="out-number" hint="Include country code, e.g. +91 98765 43210">
        <Input
          id="out-number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+91 98765 43210"
          autoFocus
        />
      </Field>
      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
        In simulation mode the provider connects the call instantly. With Exotel configured,
        the provider first rings your registered phone, then bridges the customer.
      </div>
    </Modal>
  );
}
