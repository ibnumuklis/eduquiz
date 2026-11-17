import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, ClipboardList, PlayCircle, Plus, Target, Users } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { ActivityChart, DistributionChart } from "@/components/charts/charts";
import { buttonClass } from "@/components/ui/button";
import { formatRelative, formatScore } from "@/lib/utils";

export const metadata: Metadata = { title: "Dasbor Guru" };

interface Dash {
  total_quizzes: number; active_quizzes: number; finished_quizzes: number; draft_quizzes: number; total_students: number;
  average_score: number | null; total_submissions: number; pending_grading: number;
  activity: { date: string; submissions: number }[]; distribution: { range: string; count: number }[];
  recent: { student: string; quiz: string; score: number; passed: boolean; submitted_at: string; attempt_id: string }[];
}

export default async function TeacherDashboard() {
  const session = await requireSchoolRole("teacher");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_dashboard", { p_school: session.schoolId });
  if (error) throw new Error(error.message);
  const d = data as Dash;
  const firstName = session.profile.full_name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Selamat datang, ${firstName || "Guru"} 👋`}
        description="Ringkasan kuis dan hasil belajar siswa Anda"
        actions={<Link href="/teacher/quizzes/new" className={buttonClass()}><Plus className="h-4 w-4" /> Buat kuis</Link>}
      />
      {d.pending_grading > 0 && (
        <Alert tone="warning" className="mb-6" title={`${d.pending_grading} jawaban menunggu koreksi manual`}>
          <Link href="/teacher/grading" className="font-semibold underline">Koreksi sekarang</Link>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total kuis" value={d.total_quizzes} icon={ClipboardList} hint={`${d.draft_quizzes} draft`} />
        <StatCard label="Kuis aktif" value={d.active_quizzes} icon={PlayCircle} tone="accent" />
        <StatCard label="Kuis selesai" value={d.finished_quizzes} icon={CheckCircle2} tone="violet" />
        <StatCard label="Siswa diajar" value={d.total_students} icon={Users} tone="amber" />
        <StatCard label="Rata-rata nilai" value={formatScore(d.average_score)} icon={Target} tone="brand" />
        <StatCard label="Total pengumpulan" value={d.total_submissions} icon={ClipboardCheck} tone="accent" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Aktivitas pengerjaan" description="14 hari terakhir" />
          <CardBody><ActivityChart data={d.activity} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Distribusi nilai" description="Seluruh pengumpulan kuis Anda" />
          <CardBody><DistributionChart data={d.distribution} /></CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Aktivitas terbaru" />
        {d.recent.length === 0 ? (
          <EmptyState className="m-4" title="Belum ada pengumpulan" description="Publikasikan kuis dan bagikan ke kelas Anda." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.recent.map((r) => (
              <li key={r.attempt_id}>
                <Link href={`/teacher/attempts/${r.attempt_id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{r.student}</p>
                    <p className="truncate text-xs text-slate-500">{r.quiz} · {formatRelative(r.submitted_at)}</p>
                  </div>
                  <Badge tone={r.passed ? "green" : "red"}>{formatScore(r.score)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
