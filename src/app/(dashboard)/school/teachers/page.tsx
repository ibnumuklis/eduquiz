import type { Metadata } from "next";
import Link from "next/link";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { TeachersManager, type StaffRow } from "./teachers-manager";

export const metadata: Metadata = { title: "Guru & Staf" };

export default async function TeachersPage() {
  const session = await requireSchoolRole("school_admin");
  const supabase = await createClient();
  const [{ data: members }, { data: teaching }, { data: subjects }, { data: classes }] = await Promise.all([
    supabase
      .from("school_members")
      .select("id, user_id, role, status, created_at, profile:profiles(full_name, email)")
      .eq("school_id", session.schoolId)
      .in("role", ["school_admin", "teacher"])
      .order("created_at"),
    supabase
      .from("teacher_subjects")
      .select("id, teacher_id, subject:subjects(name), class:classes(name)")
      .eq("school_id", session.schoolId),
    supabase.from("subjects").select("id, name").eq("school_id", session.schoolId).order("name"),
    supabase.from("classes").select("id, name").eq("school_id", session.schoolId).order("name"),
  ]);

  const rows: StaffRow[] = ((members ?? []) as unknown as StaffRow[]).map((m) => ({
    ...m,
    teaching: ((teaching ?? []) as unknown as { id: string; teacher_id: string; subject: { name: string }; class: { name: string } }[])
      .filter((t) => t.teacher_id === m.user_id)
      .map((t) => ({ id: t.id, label: `${t.subject?.name} · ${t.class?.name}` })),
  }));

  return (
    <>
      <PageHeader
        title="Guru & Staf"
        description="Kelola peran, status, dan penugasan mengajar"
        actions={<Link href="/school/invitations?role=teacher" className={buttonClass()}>Undang guru</Link>}
      />
      <TeachersManager rows={rows} subjects={subjects ?? []} classes={classes ?? []} currentUserId={session.userId} />
    </>
  );
}
