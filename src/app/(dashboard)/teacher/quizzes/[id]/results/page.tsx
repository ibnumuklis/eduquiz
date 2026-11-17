import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, FileSpreadsheet, Percent, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz } from "@/features/quizzes/queries";
import { getQuizReport } from "@/features/reports/queries";
import { distribution, rankStudents, summarize } from "@/lib/utils/report";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { DistributionChart } from "@/components/charts/charts";
import { buttonClass } from "@/components/ui/button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatDuration, formatScore } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan Nilai" };

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string; view?: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { id } = await params;
  const { class: classFilter = "", view = "rank" } = await searchParams;
  const quiz = await getManagedQuiz(id);
  const report = await getQuizReport(id);
  if (!report || report.rows.length === 0) {
    return <EmptyState title="Belum ada pengumpulan" description="Laporan akan muncul setelah siswa mengumpulkan kuis." />;
  }
  const rows = classFilter ? report.rows.filter((r) => r.class_name.split(", ").includes(classFilter)) : report.rows;
  const ranked = rankStudents(rows);
  const stats = summarize(ranked.map((r) => r.score), Number(quiz.passing_grade));
  const base = `/teacher/quizzes/${id}/results`;
  const qs = (p: Record<string, string>) => `${base}?${new URLSearchParams({ ...(classFilter ? { class: classFilter } : {}), view, ...p })}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}?view=${view}`} className={buttonClass(classFilter ? "outline" : "secondary", "sm")}>Semua kelas</Link>
          {report.classes.map((c) => (
            <Link key={c} href={`${base}?${new URLSearchParams({ class: c, view })}`} className={buttonClass(classFilter === c ? "secondary" : "outline", "sm")}>{c}</Link>
          ))}
        </div>
        <div className="flex gap-2">
          <a href={`/api/reports/${id}?format=csv`} className={buttonClass("outline", "sm")}><Download className="h-4 w-4" /> CSV</a>
          <a href={`/api/reports/${id}?format=xlsx`} className={buttonClass("primary", "sm")}><FileSpreadsheet className="h-4 w-4" /> Excel</a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Siswa mengumpulkan" value={stats.count} icon={Users} />
        <StatCard label="Rata-rata" value={formatScore(stats.average)} icon={Target} tone="violet" />
        <StatCard label="Tertinggi" value={formatScore(stats.highest)} icon={TrendingUp} tone="accent" />
        <StatCard label="Terendah" value={formatScore(stats.lowest)} icon={TrendingDown} tone="rose" />
        <StatCard label="Ketuntasan" value={`${stats.passRate ?? 0}%`} icon={Percent} tone="amber" hint={`KKM ${formatScore(quiz.passing_grade)}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title={view === "history" ? "Riwayat pengerjaan" : "Ranking kelas"}
            description={view === "history" ? "Semua percobaan siswa" : "Nilai terbaik setiap siswa"}
            action={
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                <Link href={qs({ view: "rank" })} className={view !== "history" ? "rounded-lg bg-white px-3 py-1.5 shadow-sm" : "px-3 py-1.5 text-slate-500"}>Ranking</Link>
                <Link href={qs({ view: "history" })} className={view === "history" ? "rounded-lg bg-white px-3 py-1.5 shadow-sm" : "px-3 py-1.5 text-slate-500"}>Riwayat</Link>
              </div>
            }
          />
          <Table>
            {view === "history" ? (
              <>
                <THead><tr><TH>Siswa</TH><TH>Kelas</TH><TH>Ke-</TH><TH>Dikumpulkan</TH><TH>Durasi</TH><TH>B/S/K</TH><TH className="text-right">Nilai</TH></tr></THead>
                <tbody>
                  {[...rows].sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "")).map((r) => (
                    <TR key={r.attempt_id}>
                      <TD className="font-medium text-slate-800">{r.student_name}</TD>
                      <TD>{r.class_name}</TD>
                      <TD>{r.attempt_number}</TD>
                      <TD className="text-xs text-slate-500">{formatDateTime(r.submitted_at, session.timezone)} {r.is_late && <Badge tone="amber">Terlambat</Badge>}</TD>
                      <TD className="text-xs">{formatDuration(r.duration_seconds)}</TD>
                      <TD className="text-xs">{r.correct_count}/{r.wrong_count}/{r.unanswered_count}</TD>
                      <TD className="text-right"><Link href={`/teacher/attempts/${r.attempt_id}`} className="font-bold text-brand-700 hover:underline">{formatScore(r.score)}</Link></TD>
                    </TR>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <THead><tr><TH>#</TH><TH>Siswa</TH><TH>Kelas</TH><TH>Percobaan</TH><TH>Status</TH><TH className="text-right">Nilai</TH></tr></THead>
                <tbody>
                  {ranked.map((r) => (
                    <TR key={r.student_id}>
                      <TD className="w-12">{r.rank <= 3 ? <Award className={r.rank === 1 ? "h-5 w-5 text-amber-500" : r.rank === 2 ? "h-5 w-5 text-slate-400" : "h-5 w-5 text-orange-400"} /> : <span className="font-semibold text-slate-500">{r.rank}</span>}</TD>
                      <TD><p className="font-medium text-slate-800">{r.student_name}</p><p className="text-xs text-slate-500">{r.student_number ? `NIS ${r.student_number}` : r.email}</p></TD>
                      <TD>{r.class_name}</TD>
                      <TD>{r.attempts}</TD>
                      <TD>{r.pending_manual > 0 ? <Badge tone="amber">Menunggu koreksi</Badge> : <Badge tone={r.passed ? "green" : "red"}>{r.passed ? "Tuntas" : "Belum tuntas"}</Badge>}</TD>
                      <TD className="text-right"><Link href={`/teacher/attempts/${r.attempt_id}`} className="text-base font-bold text-brand-700 hover:underline">{formatScore(r.score)}</Link></TD>
                    </TR>
                  ))}
                </tbody>
              </>
            )}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Distribusi nilai" description="Berdasarkan nilai terbaik" />
          <CardBody><DistributionChart data={distribution(ranked.map((r) => r.score))} /></CardBody>
        </Card>
      </div>
    </>
  );
}
