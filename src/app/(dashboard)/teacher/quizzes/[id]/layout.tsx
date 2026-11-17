import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz } from "@/features/quizzes/queries";
import { Badge } from "@/components/ui/feedback";
import { quizState } from "@/lib/utils/quiz";
import { QuizTabs } from "./quiz-tabs";
import { QuizStatusActions } from "./quiz-status-actions";

export default async function QuizLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const st = quizState(quiz);
  return (
    <>
      <div className="mb-6 animate-fade-in">
        <Link href="/teacher/quizzes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Kuis saya</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{quiz.title}</h1>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {quiz.subject?.name ?? "Tanpa mata pelajaran"} · {quiz.duration_minutes} menit · Kode akses{" "}
              <span className="font-mono font-bold text-brand-700">{quiz.access_code}</span>
            </p>
          </div>
          <QuizStatusActions id={quiz.id} status={quiz.status} />
        </div>
      </div>
      <QuizTabs id={quiz.id} status={quiz.status} />
      <div className="mt-6">{children}</div>
    </>
  );
}
