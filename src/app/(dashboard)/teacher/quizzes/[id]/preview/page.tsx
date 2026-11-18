import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz, getQuizQuestions, getQuizStimuli } from "@/features/quizzes/queries";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import { Alert, EmptyState } from "@/components/ui/feedback";
import type { AttemptPayload } from "@/types";

export const metadata: Metadata = { title: "Preview Kuis" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const [questions, stimuli] = await Promise.all([getQuizQuestions(id), getQuizStimuli(id)]);
  const stimById = new Map(stimuli.map((s) => [s.id, s]));
  // Same grouping & presentation rules as the server: stimulus groups stay together, ordering items are shuffled.
  const shuffle = <T,>(arr: T[]) => arr.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (!questions.length) return <EmptyState title="Belum ada soal untuk dipreview" />;
  const started = new Date();
  const now = started.toISOString();
  const payload: AttemptPayload = {
    attempt: { id: "preview", status: "in_progress", started_at: now, expires_at: new Date(started.getTime() + quiz.duration_minutes * 60000).toISOString(), submitted_at: null, attempt_number: 1, answered_count: 0, total_questions: questions.length },
    quiz: { id: quiz.id, title: quiz.title, description: quiz.description, duration_minutes: quiz.duration_minutes, show_result: quiz.show_result, mode: quiz.mode, theme: quiz.theme, language: quiz.language },
    server_now: now,
    questions: questions.map((q) => {
      const opts = q.question_options.map((o) => ({ id: o.id, label: o.label }));
      const stim = q.stimulus_id ? stimById.get(q.stimulus_id) : null;
      return {
        id: q.id, type: q.type, prompt: q.prompt, image_path: q.image_path, image_url: q.image_url, points: q.points,
        options: q.type === "ordering" ? shuffle(opts) : opts,
        stimulus: stim ? { title: stim.title, content: stim.content, image_path: stim.image_path, image_url: stim.image_url } : null,
        rubric: q.type === "essay" ? q.payload?.rubric ?? null : null,
        has_hint: Boolean(q.payload?.hint),
        hint: q.payload?.hint || null,
        audio_path: q.payload?.audio_path ?? null,
        audio_url: q.audio_url ?? null,
        audio_max_plays: q.payload?.audio_max_plays ?? 0,
        right_choices: q.type === "matching" ? shuffle([...new Set(q.question_options.map((o) => o.match_text).filter((m): m is string => Boolean(m)))]) : null,
      };
    }),
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
