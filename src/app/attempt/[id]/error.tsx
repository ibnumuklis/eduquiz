"use client";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";

export default function AttemptError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Gagal memuat kuis</h1>
        <p className="mt-1 text-sm text-slate-500">Jawaban yang sudah tersimpan aman. Periksa koneksi lalu muat ulang.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Muat ulang</Button>
          <Link href="/student" className={buttonClass("outline")}>Ke dasbor</Link>
        </div>
      </div>
    </div>
  );
}
