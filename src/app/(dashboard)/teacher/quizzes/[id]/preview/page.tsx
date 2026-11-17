import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz, getQuizQuestions } from "@/features/quizzes/queries";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import { Alert, EmptyState } from "@/components/ui/feedback";
import type { AttemptPayload } from "@/types";

export const metadata: Metadata = { title: "Preview Kuis" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const questions = await getQuizQuestions(id);
  if (!questions.length) return <EmptyState title="Belum ada soal untuk dipreview" />;
  const started = new Date();
  const now = started.toISOString();
  const payload: AttemptPayload = {
    attempt: { id: "preview", status: "in_progress", started_at: now, expires_at: new Date(started.getTime() + quiz.duration_minutes * 60000).toISOString(), submitted_at: null, attempt_number: 1, answered_count: 0, total_questions: questions.length },
    quiz: { id: quiz.id, title: quiz.title, description: quiz.description, duration_minutes: quiz.duration_minutes, show_result: quiz.show_result },
    server_now: now,
    questions: questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, image_path: q.image_path, image_url: q.image_url, points: q.points, options: q.question_options.map((o) => ({ id: o.id, label: o.label })) })),
    answers: {},
  };
  return (
    <>
      <Alert tone="info" className="mb-2">Tampilan ini persis seperti yang dilihat siswa. Jawaban tidak disimpan.</Alert>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-surface">
        <QuizPlayer payload={payload} preview />
      </div>
    </>
  );
}
