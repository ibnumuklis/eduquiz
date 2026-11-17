import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardList, GraduationCap, Mail, Send, Target, UserSquare2, Users } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { ActivityChart } from "@/components/charts/charts";
import { buttonClass } from "@/components/ui/button";
import { formatScore } from "@/lib/utils";

export const metadata: Metadata = { title: "Dasbor Sekolah" };

interface Stats {
  teachers: number; students: number; classes: number; subjects: number; quizzes: number; published_quizzes: number;
  submissions: number; average_score: number | null; pending_invitations: number; activity: { date: string; submissions: number }[];
}

export default async function SchoolDashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const session = await requireSchoolRole("school_admin");
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("school_dashboard", { p_school: session.schoolId });
  if (error) throw new Error(error.message);
  const s = data as Stats;
  const setup = [
    { done: s.subjects > 0, label: "Tambahkan mata pelajaran", href: "/school/subjects" },
    { done: s.classes > 0, label: "Buat kelas", href: "/school/classes" },
    { done: s.teachers > 1, label: "Undang guru", href: "/school/invitations" },
    { done: s.students > 0, label: "Undang atau impor siswa", href: "/school/invitations" },
  ];
  const pendingSetup = setup.filter((x) => !x.done);

  return (
    <>
      <PageHeader title={session.activeMembership.school.name} description="Ringkasan aktivitas sekolah Anda" />
      {welcome && <Alert tone="success" className="mb-6" title="Sekolah berhasil dibuat!">Ikuti langkah persiapan di bawah untuk mulai.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Guru & staf" value={s.teachers} icon={UserSquare2} />
        <StatCard label="Siswa" value={s.students} icon={Users} tone="accent" />
        <StatCard label="Kelas" value={s.classes} icon={GraduationCap} tone="violet" />
        <StatCard label="Mata pelajaran" value={s.subjects} icon={BookOpen} tone="amber" />
        <StatCard label="Total kuis" value={s.quizzes} icon={ClipboardList} hint={`${s.published_quizzes} sedang dipublikasikan`} />
        <StatCard label="Pengumpulan" value={s.submissions} icon={Send} tone="accent" />
        <StatCard label="Rata-rata nilai" value={formatScore(s.average_score)} icon={Target} tone="violet" />
        <StatCard label="Undangan aktif" value={s.pending_invitations} icon={Mail} tone="slate" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Aktivitas pengerjaan" description="Jumlah kuis yang dikumpulkan 14 hari terakhir" />
          <CardBody><ActivityChart data={s.activity} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Persiapan sekolah" description={pendingSetup.length ? `${pendingSetup.length} langkah tersisa` : "Semua langkah selesai 🎉"} />
          <CardBody className="space-y-2">
            {setup.map((x) => (
              <Link key={x.label} href={x.href} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-sm hover:bg-slate-50">
                <span className={x.done ? "text-slate-400 line-through" : "font-medium text-slate-700"}>{x.label}</span>
                <span className={x.done ? "text-emerald-500" : "text-brand-600"}>{x.done ? "✓" : "→"}</span>
              </Link>
            ))}
            <Link href="/teacher/quizzes/new" className={buttonClass("primary", "md", "mt-3 w-full")}>Buat kuis pertama</Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
