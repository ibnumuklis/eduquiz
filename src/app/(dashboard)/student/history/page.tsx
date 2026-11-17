import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatDuration, formatScore } from "@/lib/utils";

export const metadata: Metadata = { title: "Riwayat Nilai" };

export default async function HistoryPage() {
  const session = await requireSchoolRole("student");
  const supabase = await createClient();
  const [{ data: attempts }, { data: results }] = await Promise.all([
    supabase.from("quiz_attempts").select("id, attempt_number, status, started_at, submitted_at, auto_submitted, is_late, quiz:quizzes(title, show_result, subject:subjects(name))")
      .eq("student_id", session.userId).eq("school_id", session.schoolId).order("started_at", { ascending: false }).limit(200),
    supabase.from("quiz_results").select("attempt_id, score, passed, duration_seconds, pending_manual").eq("student_id", session.userId),
  ]);
  const res = new Map((results ?? []).map((r) => [r.attempt_id as string, r]));
  const rows = (attempts ?? []) as unknown as { id: string; attempt_number: number; status: string; started_at: string; submitted_at: string | null; auto_submitted: boolean; is_late: boolean; quiz: { title: string; show_result: boolean; subject: { name: string } | null } }[];
  return (
    <>
      <PageHeader title="Riwayat Pengerjaan" description="Semua kuis yang pernah kamu kerjakan" />
      {rows.length === 0 ? <EmptyState icon={History} title="Belum ada riwayat" description="Kerjakan kuis pertamamu!" /> : (
        <Card>
          <Table>
            <THead><tr><TH>Kuis</TH><TH>Percobaan</TH><TH>Dikumpulkan</TH><TH>Durasi</TH><TH>Status</TH><TH className="text-right">Nilai</TH></tr></THead>
            <tbody>
              {rows.map((a) => {
                const r = res.get(a.id);
                return (
                  <TR key={a.id}>
                    <TD><p className="font-medium text-slate-800">{a.quiz?.title}</p><p className="text-xs text-slate-500">{a.quiz?.subject?.name ?? "Umum"}</p></TD>
                    <TD>Ke-{a.attempt_number}</TD>
                    <TD className="text-xs text-slate-500">{a.status === "in_progress" ? <Link href={`/attempt/${a.id}`} className="font-semibold text-brand-600">Lanjutkan →</Link> : formatDateTime(a.submitted_at, session.timezone)}</TD>
                    <TD className="text-xs">{r ? formatDuration(r.duration_seconds) : "—"}</TD>
                    <TD>{a.status === "in_progress" ? <Badge tone="brand">Berlangsung</Badge> : r?.pending_manual ? <Badge tone="amber">Dikoreksi</Badge> : r ? <Badge tone={r.passed ? "green" : "red"}>{r.passed ? "Lulus" : "Belum lulus"}</Badge> : <Badge>Dikumpulkan</Badge>}</TD>
                    <TD className="text-right">{a.status === "submitted" ? <Link href={`/student/results/${a.id}`} className="font-bold text-brand-700 hover:underline">{r ? formatScore(r.score) : "Lihat"}</Link> : "—"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
