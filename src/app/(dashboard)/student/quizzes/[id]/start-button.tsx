"use client";
import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { startAttempt } from "@/features/attempts/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function StartQuizButton({ quizId, label }: { quizId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="lg" variant="accent" className="w-full" onClick={() => setOpen(true)}><Play className="h-5 w-5" /> {label}</Button>
      <ConfirmDialog
        open={open} onClose={() => setOpen(false)} tone="primary" loading={pending}
        title="Siap mengerjakan?" confirmLabel="Mulai sekarang"
        description="Timer akan langsung berjalan. Pastikan koneksi internet stabil."
        onConfirm={() => start(async () => {
          const r = await startAttempt(quizId);
          if (r && !r.ok) { toast.error(r.error); setOpen(false); }
        })}
      />
    </>
  );
}
