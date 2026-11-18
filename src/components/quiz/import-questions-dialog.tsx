"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

interface ImportResult { imported: number; total: number; errors: { row: number; message: string }[] }

export function ImportQuestionsDialog({ quizId, open, onClose }: { quizId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/quizzes/${quizId}/import`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Impor gagal"); return; }
      setResult(json as ImportResult);
      if (json.imported > 0) { toast.success(`${json.imported} soal berhasil diimpor`); router.refresh(); }
    } catch {
      toast.error("Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => { setFile(null); setResult(null); onClose(); };

  return (
    <Dialog open={open} onClose={close} title="Impor soal dari Excel / CSV" size="lg"
      description="Isi template EDUQUIZ, lalu unggah. Mendukung semua tipe soal termasuk PGK B/S, menjodohkan, urutan, dan uraian.">
      <div className="space-y-4">
        <ol className="space-y-2 text-sm text-slate-600">
          <li><strong>1.</strong> Unduh template, baca sheet <em>Petunjuk</em>, lalu ganti baris contoh dengan soal Anda.</li>
          <li><strong>2.</strong> Simpan sebagai .xlsx (atau .csv dengan kolom yang sama). Maks. 300 soal, 2 MB.</li>
          <li><strong>3.</strong> Unggah. Baris yang bermasalah dilewati dan dilaporkan nomor barisnya.</li>
        </ol>
        <a href="/api/templates/questions" className={buttonClass("outline", "sm")}><Download className="h-4 w-4" /> Unduh template Excel</a>

        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center">
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
          <FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-medium text-slate-700">{file ? file.name : "Belum ada file dipilih"}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>Pilih file</Button>
        </div>

        {result && (
          <div className="space-y-2">
            <Alert tone={result.errors.length ? "warning" : "success"} title={`${result.imported} dari ${result.total} soal diimpor`}>
              {result.errors.length ? "Perbaiki baris berikut di file lalu impor ulang khusus baris tersebut." : "Semua soal berhasil masuk."}
            </Alert>
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                {result.errors.map((e, i) => <li key={i}><strong>Baris {e.row}:</strong> {e.message}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={close}>{result?.imported ? <><CheckCircle2 className="h-4 w-4" /> Selesai</> : "Batal"}</Button>
          <Button onClick={upload} loading={busy} disabled={!file}><Upload className="h-4 w-4" /> Impor</Button>
        </div>
      </div>
    </Dialog>
  );
}
