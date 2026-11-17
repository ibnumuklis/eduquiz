"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" loading={pending} onClick={() => start(async () => {
      await createClient().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      router.refresh();
    })}>
      <CheckCheck className="h-4 w-4" /> Tandai semua dibaca
    </Button>
  );
}
