"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Copy, Pencil, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteQuiz, duplicateQuiz } from "@/features/quizzes/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { QuizStatus } from "@/types";

export function QuizRowActions({ id, title, status }: { id: string; title: string; status: QuizStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="inline-flex items-center">
      <Link href={`/teacher/quizzes/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Edit"><Pencil className="h-4 w-4" /></Link>
      {status !== "draft" && <Link href={`/teacher/quizzes/${id}/monitor`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Monitoring"><Radio className="h-4 w-4" /></Link>}
      {status !== "draft" && <Link href={`/teacher/quizzes/${id}/results`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Laporan nilai"><BarChart3 className="h-4 w-4" /></Link>}
      <Button
        variant="ghost" size="icon" aria-label="Duplikasi" disabled={pending}
        onClick={() => start(async () => {
          const r = await duplicateQuiz(id);
          if (r.ok) { toast.success(r.message ?? "OK"); if (r.data) router.push(`/teacher/quizzes/${r.data.id}`); } else toast.error(r.error);
        })}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} title={`Hapus "${title}"?`}
        description="Semua soal, pengerjaan, dan nilai siswa untuk kuis ini akan terhapus permanen. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus permanen" loading={pending}
        onConfirm={() => start(async () => { const r = await deleteQuiz(id); if (r.ok) { toast.success(r.message ?? "OK"); setConfirm(false); } else toast.error(r.error); })}
      />
    </div>
  );
}
