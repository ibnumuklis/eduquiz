"use client";
import { useState, useTransition } from "react";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { startLive } from "@/features/live/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";

export function LiveStartButton({ quizId }: { quizId: string }) {
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState(20);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)} tooltip="Kuis bersama di kelas: soal tampil di proyektor, siswa menjawab dari HP, skor dari ketepatan & kecepatan.">
        <Radio className="h-4 w-4" /> Mulai Live
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mulai kuis Live"
        description="Tampilkan layar berikutnya di proyektor. Siswa bergabung lewat menu Gabung Live dengan kode 6 angka.">
        <div className="space-y-4 text-sm text-slate-600">
          <ul className="list-inside list-disc space-y-1">
            <li>Soal yang dipakai: pilihan ganda, benar/salah, isian singkat, polling, dan word cloud.</li>
            <li>Soal tipe lain (uraian, menjodohkan, dll.) dilewati.</li>
            <li>Skor Live tidak memengaruhi nilai rapor.</li>
          </ul>
          <label className="flex items-center gap-3 font-medium text-slate-700">
            Waktu per soal
            <Select value={String(seconds)} onChange={(e) => setSeconds(Number(e.target.value))} className="w-36">
              {[10, 15, 20, 30, 45, 60, 90].map((s) => <option key={s} value={s}>{s} detik</option>)}
            </Select>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="accent" loading={pending} onClick={() => start(async () => { const r = await startLive(quizId, seconds); if (r && !r.ok) toast.error(r.error); })}>
              <Radio className="h-4 w-4" /> Buka ruang Live
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
