import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz } from "@/features/quizzes/queries";
import { createClient } from "@/lib/supabase/server";
import { QuizSettingsForm } from "@/components/quiz/quiz-settings-form";
import { updateQuizSettings } from "@/features/quizzes/actions";

export const metadata: Metadata = { title: "Pengaturan Kuis" };

export default async function QuizSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("school_id", quiz.school_id).order("name");
  return (
    <QuizSettingsForm
      action={updateQuizSettings.bind(null, quiz.id)}
      initial={quiz}
      subjects={subjects ?? []}
      timezone={session.timezone}
      submitLabel="Simpan pengaturan"
    />
  );
}
