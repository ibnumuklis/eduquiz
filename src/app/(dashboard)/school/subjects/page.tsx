import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { SubjectsManager } from "./subjects-manager";

export const metadata: Metadata = { title: "Mata Pelajaran" };

export default async function SubjectsPage() {
  const session = await requireSchoolRole("school_admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("subjects")
    .select("id, name, code, quizzes(count), teacher_subjects(count)")
    .eq("school_id", session.schoolId)
    .order("name");
  const rows = ((data ?? []) as unknown as { id: string; name: string; code: string | null; quizzes: { count: number }[]; teacher_subjects: { count: number }[] }[]).map((s) => ({
    id: s.id, name: s.name, code: s.code, quizzes: s.quizzes?.[0]?.count ?? 0, teachers: s.teacher_subjects?.[0]?.count ?? 0,
  }));
  return (
    <>
      <PageHeader title="Mata Pelajaran" description="Daftar mata pelajaran yang diajarkan di sekolah" />
      <SubjectsManager rows={rows} />
    </>
  );
}
