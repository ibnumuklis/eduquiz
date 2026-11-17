import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getQuizReport } from "@/features/reports/queries";
import { rankStudents, summarize, toCsv } from "@/lib/utils/report";

export const dynamic = "force-dynamic";

function fileSafe(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "kuis";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: canManage } = await supabase.rpc("can_manage_quiz", { p_quiz: quizId });
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const report = await getQuizReport(quizId);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ranked = rankStudents(report.rows);
  const rank = new Map(ranked.map((r) => [r.attempt_id, r.rank]));
  const headers = ["Ranking", "Nama", "NIS", "Email", "Kelas", "Percobaan ke-", "Mulai", "Dikumpulkan", "Durasi (detik)", "Benar", "Salah", "Kosong", "Menunggu koreksi", "Nilai", "Status", "Terlambat"];
  const rows = [...report.rows]
    .sort((a, b) => a.student_name.localeCompare(b.student_name) || a.attempt_number - b.attempt_number)
    .map((r) => [
      rank.get(r.attempt_id) ?? "", r.student_name, r.student_number ?? "", r.email, r.class_name, r.attempt_number,
      r.started_at, r.submitted_at ?? "", r.duration_seconds, r.correct_count, r.wrong_count, r.unanswered_count,
      r.pending_manual, r.score, r.passed ? "Tuntas" : "Belum tuntas", r.is_late ? "Ya" : "Tidak",
    ]);
  const name = `nilai-${fileSafe(report.quiz.title)}`;

  if (format === "csv") {
    return new NextResponse("﻿" + toCsv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "EDUQUIZ";
  const stats = summarize(ranked.map((r) => r.score), Number(report.quiz.passing_grade));
  const summary = wb.addWorksheet("Ringkasan");
  summary.addRows([
    ["Kuis", report.quiz.title],
    ["Mata pelajaran", report.quiz.subject?.name ?? "-"],
    ["KKM", Number(report.quiz.passing_grade)],
    ["Jumlah siswa", stats.count],
    ["Rata-rata", stats.average],
    ["Tertinggi", stats.highest],
    ["Terendah", stats.lowest],
    ["Median", stats.median],
    ["Ketuntasan (%)", stats.passRate],
  ]);
  summary.getColumn(1).width = 22;
  summary.getColumn(1).font = { bold: true };
  summary.getColumn(2).width = 40;

  const rankSheet = wb.addWorksheet("Ranking");
  rankSheet.columns = [
    { header: "Ranking", key: "rank", width: 9 }, { header: "Nama", key: "name", width: 30 }, { header: "NIS", key: "nis", width: 14 },
    { header: "Kelas", key: "class", width: 14 }, { header: "Nilai terbaik", key: "score", width: 13 }, { header: "Status", key: "status", width: 14 },
  ];
  ranked.forEach((r) => rankSheet.addRow({ rank: r.rank, name: r.student_name, nis: r.student_number ?? "", class: r.class_name, score: r.score, status: r.passed ? "Tuntas" : "Belum tuntas" }));

  const detail = wb.addWorksheet("Semua Percobaan");
  detail.addRow(headers);
  rows.forEach((r) => detail.addRow(r));
  for (const ws of [rankSheet, detail]) {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  detail.columns.forEach((c) => (c.width = 16));
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
