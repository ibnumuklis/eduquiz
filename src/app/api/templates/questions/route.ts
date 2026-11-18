import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_COLUMNS, TEMPLATE_EXAMPLES, TYPE_HELP } from "@/lib/import/questions";

export const dynamic = "force-dynamic";

/** Downloadable Excel template for bulk question import. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "EDUQUIZ";
  const ws = wb.addWorksheet("Soal");
  ws.columns = TEMPLATE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === "pertanyaan" ? 50 : key.startsWith("opsi_") ? 26 : key === "pembahasan" || key === "kunci" ? 30 : 12,
  }));
  TEMPLATE_EXAMPLES.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn("pertanyaan").alignment = { wrapText: true, vertical: "top" };

  const help = wb.addWorksheet("Petunjuk");
  help.columns = [{ header: "Kode tipe", key: "code", width: 12 }, { header: "Jenis soal", key: "type", width: 32 }, { header: "Cara mengisi", key: "how", width: 90 }];
  TYPE_HELP.forEach((h) => help.addRow(h));
  help.addRow({});
  help.addRow({ code: "Umum", how: "Hapus baris contoh sebelum mengimpor. Satu baris = satu soal. Maks. 300 soal per file." });
  help.addRow({ code: "bobot", how: "Angka poin (default 10). Polling & word cloud tidak dinilai." });
  help.addRow({ code: "kode_tp", how: "Opsional. Kode Tujuan Pembelajaran yang sudah didaftarkan di menu TP/CP, mis. TP-1.1" });
  help.addRow({ code: "petunjuk", how: "Opsional. Ditampilkan bila siswa memakai power-up Petunjuk." });
  help.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-soal-eduquiz.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
