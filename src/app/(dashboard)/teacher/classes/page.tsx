import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, Badge, EmptyState, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Kelas Saya" };

export default async function TeacherClassesPage() {
  const session = await requireSchoolRole("teacher");
  const supabase = await createClient();
  const [{ data: classes }, { data: teaching }] = await Promise.all([
    // RLS returns only classes this teacher teaches / homerooms (all for school admins)
    supabase.from("classes").select("id, name, grade_level, homeroom_teacher_id, class_students(student:profiles(id, full_name, email))").eq("school_id", session.schoolId).order("name"),
    supabase.from("teacher_subjects").select("class_id, subject:subjects(name)").eq("teacher_id", session.userId),
  ]);
  const subjectsOf = new Map<string, string[]>();
  ((teaching ?? []) as unknown as { class_id: string; subject: { name: string } }[]).forEach((t) => subjectsOf.set(t.class_id, [...(subjectsOf.get(t.class_id) ?? []), t.subject?.name]));
  const rows = (classes ?? []) as unknown as { id: string; name: string; grade_level: string | null; homeroom_teacher_id: string | null; class_students: { student: { id: string; full_name: string; email: string } }[] }[];

  return (
    <>
      <PageHeader title="Kelas Saya" description="Kelas dan mata pelajaran yang Anda ajar" />
      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Anda belum ditugaskan ke kelas" description="Admin sekolah dapat menugaskan Anda melalui menu Guru & Staf." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {rows.map((c) => (
            <Card key={c.id}>
              <CardHeader
                title={c.name}
                description={`${c.class_students.length} siswa`}
                action={<div className="flex flex-wrap gap-1">
                  {c.homeroom_teacher_id === session.userId && <Badge tone="accent">Wali kelas</Badge>}
                  {(subjectsOf.get(c.id) ?? []).map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
                </div>}
              />
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {c.class_students.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">Belum ada siswa</li>}
                {c.class_students.map(({ student }) => student && (
                  <li key={student.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar name={student.full_name} className="h-8 w-8" />
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{student.full_name}</p><p className="truncate text-xs text-slate-500">{student.email}</p></div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
