import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { parseQuestionRows, type ImportError } from "@/lib/import/questions";
import { dbErrorMessage } from "@/lib/utils/errors";

export const dynamic = "force-dynamic";
const MAX_BYTES = 2 * 1024 * 1024;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

async function readRows(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
    return res.data;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Soal") ?? wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => (headers[col] = cellText(cell.value)));
  const rows: Record<string, string>[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const obj: Record<string, string> = {};
    headers.forEach((h, col) => h && (obj[h] = cellText(row.getCell(col).value)));
    rows.push(obj);
  }
  return rows;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
  const { data: canManage } = await supabase.rpc("can_manage_quiz", { p_quiz: id });
  if (!canManage) return NextResponse.json({ error: "Anda tidak berhak mengelola kuis ini" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pilih file .xlsx atau .csv" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Ukuran file maksimal 2 MB" }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(file.name)) return NextResponse.json({ error: "Format file harus .xlsx atau .csv" }, { status: 400 });

  let rows: Record<string, string>[];
  try {
    rows = await readRows(file);
  } catch {
    return NextResponse.json({ error: "File tidak dapat dibaca. Gunakan template EDUQUIZ." }, { status: 400 });
  }
  const { payloads, errors } = parseQuestionRows(rows);
  if (payloads.length > 300) return NextResponse.json({ error: "Maksimal 300 soal per impor" }, { status: 400 });

  let imported = 0;
  let dbErrors: ImportError[] = [];
  if (payloads.length) {
    const { data, error } = await supabase.rpc("import_questions", { p_quiz: id, p_rows: payloads });
    if (error) return NextResponse.json({ error: dbErrorMessage(error) }, { status: 400 });
    const res = data as { imported: number; errors: ImportError[] };
    imported = res.imported;
    dbErrors = res.errors;
  }
  if (imported > 0) revalidatePath(`/teacher/quizzes/${id}`, "layout");
  const allErrors = [...errors, ...dbErrors].sort((a, b) => a.row - b.row);
  return NextResponse.json({ imported, errors: allErrors, total: payloads.length + errors.length });
}
