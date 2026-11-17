import type { Metadata } from "next";
import { Building2, CheckCircle2, ClipboardList, Send, UserSquare2, Users } from "lucide-react";
import { requireRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { ActivityChart } from "@/components/charts/charts";

export const metadata: Metadata = { title: "Statistik Platform" };

export default async function PlatformPage() {
  await requireRole("super_admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_dashboard");
  if (error) throw new Error(error.message);
  const d = data as { schools: number; active_schools: number; teachers: number; students: number; quizzes: number; submissions: number; activity: { date: string; submissions: number }[] };
  return (
    <>
      <PageHeader title="Statistik Platform" description="Ringkasan penggunaan EDUQUIZ di seluruh sekolah" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total sekolah" value={d.schools} icon={Building2} />
        <StatCard label="Sekolah aktif" value={d.active_schools} icon={CheckCircle2} tone="accent" />
        <StatCard label="Guru & admin" value={d.teachers} icon={UserSquare2} tone="violet" />
        <StatCard label="Siswa" value={d.students} icon={Users} tone="amber" />
        <StatCard label="Kuis" value={d.quizzes} icon={ClipboardList} tone="brand" />
        <StatCard label="Pengumpulan" value={d.submissions} icon={Send} tone="accent" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Aktivitas platform" description="Pengumpulan kuis 30 hari terakhir" />
        <CardBody><ActivityChart data={d.activity} /></CardBody>
      </Card>
    </>
  );
}
