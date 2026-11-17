import Link from "next/link";
import { CalendarClock, Clock, Repeat, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime, formatScore } from "@/lib/utils";
import type { StudentQuiz } from "@/features/attempts/student-queries";
import { STATE_META } from "@/features/attempts/state-meta";

export function StudentQuizCard({ quiz, timezone }: { quiz: StudentQuiz; timezone: string }) {
  const meta = STATE_META[quiz.state];
  const href = quiz.openAttemptId ? `/attempt/${quiz.openAttemptId}` : `/student/quizzes/${quiz.id}`;
  return (
    <Card className="flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {quiz.bestScore !== null && quiz.show_result && <span className="text-sm font-bold text-brand-700">Nilai {formatScore(quiz.bestScore)}</span>}
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold text-slate-900">{quiz.title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{quiz.subject?.name ?? "Umum"}</p>
      <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
        <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-slate-400" /> {quiz.duration_minutes} menit</li>
        <li className="flex items-center gap-2"><Repeat className="h-3.5 w-3.5 text-slate-400" /> {quiz.attemptsUsed}/{quiz.max_attempts} percobaan</li>
        {quiz.end_at && <li className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 text-slate-400" /> s/d {formatDateTime(quiz.end_at, timezone)}</li>}
        {quiz.teacher && <li className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-slate-400" /> {quiz.teacher.full_name}</li>}
      </ul>
      <div className="mt-auto pt-5">
        {quiz.state === "in_progress" ? (
          <Link href={href} className={buttonClass("primary", "md", "w-full")}>Lanjutkan</Link>
        ) : quiz.state === "available" ? (
          <Link href={href} className={buttonClass("accent", "md", "w-full")}>{quiz.attemptsUsed ? "Coba lagi" : "Mulai kuis"}</Link>
        ) : quiz.lastAttemptId ? (
          <Link href={`/student/results/${quiz.lastAttemptId}`} className={buttonClass("outline", "md", "w-full")}>Lihat hasil</Link>
        ) : (
          <Link href={href} className={buttonClass("outline", "md", "w-full")}>Detail</Link>
        )}
      </div>
    </Card>
  );
}
