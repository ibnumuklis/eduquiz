"use client";
import { useState, useTransition } from "react";
import { Lock, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { closeQuiz, publishQuiz, unpublishQuiz } from "@/features/quizzes/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { QuizStatus } from "@/types";

export function QuizStatusActions({ id, status }: { id: string; status: QuizStatus }) {
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"publish" | "close" | "unpublish" | null>(null);
  const exec = (fn: (id: string) => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn(id);
      if (r.ok) toast.success(r.message ?? "Berhasil"); else toast.error(r.error ?? "Gagal");
      setDialog(null);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && <Button onClick={() => setDialog("publish")}><Send className="h-4 w-4" /> Publikasikan</Button>}
      {status === "published" && (
        <>
          <Button variant="outline" onClick={() => setDialog("unpublish")}><RotateCcw className="h-4 w-4" /> Jadikan draft</Button>
          <Button variant="danger" onClick={() => setDialog("close")}><Lock className="h-4 w-4" /> Tutup kuis</Button>
        </>
      )}
      {status === "closed" && <Button variant="outline" onClick={() => setDialog("publish")}><Send className="h-4 w-4" /> Buka kembali</Button>}

      <ConfirmDialog
        open={dialog === "publish"} onClose={() => setDialog(null)} tone="primary" loading={pending}
        title="Publikasikan kuis?" confirmLabel="Publikasikan"
        description="Siswa di kelas yang ditugaskan akan menerima notifikasi dan dapat mengerjakan sesuai jadwal. Sistem memeriksa setiap soal punya kunci jawaban yang valid."
        onConfirm={() => exec(publishQuiz)}
      />
      <ConfirmDialog
        open={dialog === "close"} onClose={() => setDialog(null)} loading={pending}
        title="Tutup kuis sekarang?" confirmLabel="Tutup kuis"
        description="Siswa tidak dapat memulai pengerjaan baru. Pengerjaan yang sedang berlangsung akan dikumpulkan dan dinilai otomatis."
        onConfirm={() => exec(closeQuiz)}
      />
      <ConfirmDialog
        open={dialog === "unpublish"} onClose={() => setDialog(null)} tone="primary" loading={pending}
        title="Kembalikan ke draft?" confirmLabel="Jadikan draft"
        description="Hanya bisa dilakukan jika belum ada siswa yang mengerjakan."
        onConfirm={() => exec(unpublishQuiz)}
      />
    </div>
  );
}
