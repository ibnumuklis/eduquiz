import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz } from "@/features/quizzes/queries";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { SharePanel } from "./share-panel";

export const metadata: Metadata = { title: "Penugasan & Bagikan" };

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const supabase = await createClient();
  // RLS returns only classes the caller teaches (or all classes for school admins).
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, class_students(count)")
    .eq("school_id", quiz.school_id)
    .order("name");
  const rows = ((classes ?? []) as unknown as { id: string; name: string; class_students: { count: number }[] }[]).map((c) => ({
    id: c.id, name: c.name, students: c.class_students?.[0]?.count ?? 0,
  }));
  return (
    <SharePanel
      quizId={quiz.id}
      accessCode={quiz.access_code}
      access={quiz.access}
      status={quiz.status}
      classes={rows}
      assigned={quiz.quiz_assignments.map((a) => a.class_id)}
      joinUrl={`${siteUrl()}/student/join?code=${quiz.access_code}`}
      isAdmin={session.role === "school_admin"}
    />
  );
}
