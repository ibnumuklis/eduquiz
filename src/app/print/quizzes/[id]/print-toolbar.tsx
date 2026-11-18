"use client";
import Link from "next/link";
import { ArrowLeft, KeyRound, Printer } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";

export function PrintToolbar({ quizId, withKey }: { quizId: string; withKey: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
      <Link href={`/teacher/quizzes/${quizId}`} className={buttonClass("ghost", "sm")}><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <span className="text-sm text-slate-500">Pilih “Simpan sebagai PDF” pada dialog cetak untuk membuat file PDF.</span>
      <div className="ml-auto flex gap-2">
        <Link href={withKey ? `/print/quizzes/${quizId}` : `/print/quizzes/${quizId}?kunci=1`} className={buttonClass("outline", "sm")}>
          <KeyRound className="h-4 w-4" /> {withKey ? "Lembar soal siswa" : "Versi kunci jawaban"}
        </Link>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Cetak / PDF</Button>
      </div>
    </div>
  );
}
