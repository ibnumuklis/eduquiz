"use client";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads a CSV (opens directly in Excel / Google Sheets). */
export function CsvButton({ filename, head, rows, label = "Excel (CSV)" }: { filename: string; head: string[]; rows: (string | number | null)[][]; label?: string }) {
  return (
    <Button variant="outline" tooltip="Unduh tabel ini untuk diolah di Excel atau Google Sheets" onClick={() => {
      const esc = (v: string | number | null) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>
      <FileSpreadsheet className="h-4 w-4" /> {label}
    </Button>
  );
}
