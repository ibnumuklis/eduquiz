import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { ClassesManager, type ClassRow } from "./classes-manager";

export const metadata: Metadata = { title: "Kelas" };

export default async function ClassesPage() {
  const session = await requireSchoolRole("school_admin");
  const supabase = await createClient();
  const [{ data: classes }, { data: staff }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, grade_level, academic_year, homeroom_teacher_id, homeroom:profiles!classes_homeroom_teacher_id_fkey(full_name), class_students(count)")
      .eq("school_id", session.schoolId)
      .order("name"),
    supabase
      .from("school_members")
      .select("user_id, profile:profiles(full_name)")
      .eq("school_id", session.schoolId)
      .in("role", ["teacher", "school_admin"])
      .eq("status", "active"),
  ]);
  const rows = ((classes ?? []) as unknown as (Omit<ClassRow, "student_count"> & { class_students: { count: number }[] })[]).map((c) => ({
    ...c,
    student_count: c.class_students?.[0]?.count ?? 0,
  }));
  const teachers = ((staff ?? []) as unknown as { user_id: string; profile: { full_name: string } }[]).map((s) => ({
    id: s.user_id,
    name: s.profile?.full_name ?? "—",
  }));

  return (
    <>
      <PageHeader title="Kelas" description="Kelola kelas, wali kelas, dan anggota kelas" />
      <ClassesManager rows={rows} teachers={teachers} />
    </>
  );
}
