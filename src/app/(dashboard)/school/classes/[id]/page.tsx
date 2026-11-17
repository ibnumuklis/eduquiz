import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { ClassMembers } from "./class-members";

export const metadata: Metadata = { title: "Anggota Kelas" };

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSchoolRole("school_admin");
  const supabase = await createClient();
  const { data: cls } = await supabase.from("classes").select("id, name, academic_year").eq("id", id).eq("school_id", session.schoolId).maybeSingle();
  if (!cls) notFound();
  const [{ data: members }, { data: students }] = await Promise.all([
    supabase.from("class_students").select("student_id, profile:profiles(full_name, email)").eq("class_id", id),
    supabase
      .from("school_members")
      .select("user_id, student_number, profile:profiles(full_name, email)")
      .eq("school_id", session.schoolId)
      .eq("role", "student")
      .eq("status", "active")
      .limit(2000),
  ]);
  const inClass = ((members ?? []) as unknown as { student_id: string; profile: { full_name: string; email: string } }[]).map((m) => ({
    id: m.student_id, name: m.profile?.full_name ?? "—", email: m.profile?.email ?? "",
  }));
  const set = new Set(inClass.map((m) => m.id));
  const available = ((students ?? []) as unknown as { user_id: string; student_number: string | null; profile: { full_name: string; email: string } }[])
    .filter((s) => !set.has(s.user_id))
    .map((s) => ({ id: s.user_id, name: s.profile?.full_name ?? "—", email: s.profile?.email ?? "", nis: s.student_number }));

  return (
    <>
      <PageHeader
        back={<Link href="/school/classes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Semua kelas</Link>}
        title={`Kelas ${cls.name}`}
        description={`${inClass.length} siswa${cls.academic_year ? ` · ${cls.academic_year}` : ""}`}
      />
      <ClassMembers classId={id} members={inClass} available={available} />
    </>
  );
}
