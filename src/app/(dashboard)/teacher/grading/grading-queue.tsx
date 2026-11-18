"use client";
import { useState } from "react";
import Link from "next/link";
import { GradePanel } from "@/components/quiz/grade-panel";
import { Badge } from "@/components/ui/feedback";
import { QUESTION_TYPE_LABEL, type QuestionTypeValue } from "@/lib/validations/quiz";
import type { QuestionPayload } from "@/types";

export interface PendingAnswer {
  id: string;
  attempt_id: string;
  text_answer: string | null;
  question: { prompt: string; type?: QuestionTypeValue; payload?: QuestionPayload | null; points: number; accepted_answers: string[]; quiz: { id: string; title: string } };
  student: { full_name: string } | null;
}

function Row({ a }: { a: PendingAnswer }) {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <li className="grid gap-4 p-5 md:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link href={`/teacher/attempts/${a.attempt_id}`} className="font-semibold text-brand-600 hover:underline">{a.student?.full_name ?? "Siswa"}</Link>
          <span>· {a.question.quiz.title}</span>
          {a.question.type && <Badge tone="violet">{QUESTION_TYPE_LABEL[a.question.type]}</Badge>}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{a.question.prompt}</p>
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">{a.text_answer || "—"}</p>
        {a.question.accepted_answers.length > 0 && <p className="mt-1 text-xs text-emerald-700">Kunci acuan: {a.question.accepted_answers.join(" / ")}</p>}
      </div>
      <GradePanel answerId={a.id} attemptId={a.attempt_id} maxPoints={Number(a.question.points)} rubric={a.question.payload?.rubric} onDone={() => setDone(true)} />
    </li>
  );
}

export function GradingQueue({ rows }: { rows: PendingAnswer[] }) {
  return <ul className="divide-y divide-slate-100">{rows.map((a) => <Row key={a.id} a={a} />)}</ul>;
}
