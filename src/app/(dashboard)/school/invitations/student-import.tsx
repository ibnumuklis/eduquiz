"use client";
import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { importStudents, type ImportReport } from "@/features/schools/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";

const TEMPLATE = "email,full_name,student_number,class_name\nandi@contoh.sch.id,Andi Pratama,1001,X IPA 1\n";
const HEADER_ALIASES: Record<string, string> = {
  email: "email", nama: "full_name", name: "full_name", full_name: "full_name", nama_lengkap: "full_name",
  nis: "student_number", student_number: "student_number", nisn: "student_number", kelas: "class_name", class: "class_name", class_name: "class_name",
};

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function StudentImport() {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setReport(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/\s+/g, "_")] ?? h.trim().toLowerCase(),
      complete: (res) => {
        if (!res.meta.fields?.includes("email")) {
          toast.error("Kolom 'email' tidak ditemukan. Gunakan template.");
          setRows([]);
          return;
        }
        if (res.data.length > 1000) toast.warning("Hanya 1000 baris pertama yang akan diimpor");
        setRows(res.data.slice(0, 1000));
      },
      error: () => toast.error("Gagal membaca file CSV"),
    });
  }

  return (
    <Card id="import">
      <CardHeader
        title="Impor siswa dari CSV"
        description="Setiap baris menjadi undangan terikat email (berlaku 30 hari)"
        action={<Button variant="ghost" size="sm" onClick={() => download("template-siswa-eduquiz.csv", TEMPLATE)}><Download className="h-4 w-4" /> Template</Button>}
      />
      <CardBody className="space-y-4">
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 transition hover:border-brand-300 hover:bg-brand-50/40"
        >
          <FileSpreadsheet className="h-8 w-8 text-brand-500" />
          {fileName ? <span className="font-medium text-slate-700">{fileName} · {rows.length} baris</span> : "Pilih file CSV (email, full_name, student_number, class_name)"}
        </button>
        {rows.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-xl border border-slate-100 text-xs">
            <table className="w-full">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1 text-left">Email</th><th className="px-2 py-1 text-left">Nama</th><th className="px-2 py-1 text-left">Kelas</th></tr></thead>
              <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="px-2 py-1">{r.email}</td><td className="px-2 py-1">{r.full_name}</td><td className="px-2 py-1">{r.class_name}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <Button
          className="w-full" disabled={!rows.length} loading={pending}
          onClick={() => start(async () => {
            const r = await importStudents(rows);
            if (!r.ok) { toast.error(r.error); return; }
            setReport(r.data ?? null);
            toast.success(`${r.data?.imported ?? 0} siswa diundang`);
          })}
        >
          <Upload className="h-4 w-4" /> Impor {rows.length ? `${rows.length} siswa` : ""}
        </Button>
        {report && (
          <div className="space-y-3">
            <Alert tone={report.failed ? "warning" : "success"} title={`${report.imported} berhasil · ${report.failed} gagal`}>
              Siswa yang berhasil diundang cukup mendaftar/login dengan email tersebut — undangan diterima otomatis.
            </Alert>
            {report.failed > 0 && (
              <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                {report.rows.filter((r) => !r.ok).map((r) => (
                  <li key={r.row} className="flex gap-2"><Badge tone="red">Baris {r.row + 1}</Badge><span className="text-slate-600">{r.email || "(kosong)"} — {r.error}</span></li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={() => download("laporan-impor.csv", Papa.unparse(report.rows.map((r) => ({ baris: r.row + 1, email: r.email, status: r.ok ? "berhasil" : "gagal", kode: r.code ?? "", keterangan: r.error ?? "" }))))}>
              <Download className="h-4 w-4" /> Unduh laporan impor
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
