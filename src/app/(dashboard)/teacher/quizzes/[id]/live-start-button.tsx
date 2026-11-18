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
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [readSeconds, setReadSeconds] = useState(5);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)} tooltip="Kuis bersama di layar kelas">
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
          <div>
            <p className="font-medium text-slate-700">Mulai menjawab</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {([
                { v: "auto", t: "Otomatis", d: "Soal tampil & dibacakan, lalu waktu menjawab dibuka sendiri setelah jeda membaca." },
                { v: "manual", t: "Manual (guru)", d: "Soal tampil dulu. Siswa baru bisa menjawab setelah Anda menekan “Mulai menjawab”." },
              ] as const).map((o) => (
                <button key={o.v} type="button" onClick={() => setMode(o.v)}
                  className={`rounded-xl border p-3 text-left transition ${mode === o.v ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                  <p className="font-semibold text-slate-800">{o.t}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{o.d}</p>
                </button>
              ))}
            </div>
          </div>
          {mode === "auto" && (
            <label className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
              Waktu membaca
              <Select value={String(readSeconds)} onChange={(e) => setReadSeconds(Number(e.target.value))} className="w-36">
                {[0, 3, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n ? `${n} detik` : "Tanpa jeda"}</option>)}
              </Select>
            </label>
          )}
          <p className="text-xs text-slate-500">Selama soal berjalan Anda juga bisa menekan <b>Jeda</b> dan <b>Lanjutkan</b>; sisa waktu tetap tersimpan.</p>
          <label className="flex flex-wrap items-center gap-3 font-medium text-slate-700">
            Waktu per soal
            <Select value={String(seconds)} onChange={(e) => setSeconds(Number(e.target.value))} className="w-36">
              {[10, 15, 20, 30, 45, 60, 90].map((s) => <option key={s} value={s}>{s} detik</option>)}
            </Select>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="accent" loading={pending} onClick={() => start(async () => { const r = await startLive(quizId, seconds, mode, readSeconds); if (r && !r.ok) toast.error(r.error); })}>
              <Radio className="h-4 w-4" /> Buka ruang Live
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
