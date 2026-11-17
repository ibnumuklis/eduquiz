import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz, getQuizQuestions } from "@/features/quizzes/queries";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/feedback";
import { QuestionBuilder } from "./question-builder";

export const metadata: Metadata = { title: "Soal Kuis" };

export default async function QuizQuestionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireSchoolRole("teacher");
  const { id } = await params;
  const { created } = await searchParams;
  const quiz = await getManagedQuiz(id);
  const questions = await getQuizQuestions(id);
  const supabase = await createClient();
  const { count } = await supabase.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("quiz_id", id);

  return (
    <>
      {created && <Alert tone="success" className="mb-4" title="Kuis tersimpan sebagai draft">Tambahkan soal, tugaskan ke kelas, lalu publikasikan.</Alert>}
      {(count ?? 0) > 0 && (
        <Alert tone="warning" className="mb-4" title="Kuis sudah dikerjakan siswa">
          Perubahan kunci jawaban hanya berlaku untuk pengerjaan yang belum dikumpulkan. Nilai yang sudah ada tidak dihitung ulang.
        </Alert>
      )}
      <QuestionBuilder quizId={quiz.id} schoolId={quiz.school_id} questions={questions} />
    </>
  );
}
