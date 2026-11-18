"use client";
import { useState, useTransition } from "react";
import { CopyPlus } from "lucide-react";
import { toast } from "sonner";
import { copyQuestionsToQuiz } from "@/features/quizzes/actions";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { QUESTION_TYPE_LABEL } from "@/lib/validations/quiz";
import { formatScore } from "@/lib/utils";
import { keySummary } from "@/lib/utils/quiz";
import { MathText } from "@/components/quiz/math-text";
import type { QuestionType } from "@/types";

export interface BankQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  accepted_answers: string[];
  question_options: { label: string; is_correct: boolean; match_text?: string | null; position: number }[];
  quiz: { id: string; title: string; subject: { name: string } | null };
  owner?: string | null;
  objective?: string | null;
}

export function BankList({ questions, quizzes }: { questions: BankQuestion[]; quizzes: { id: string; title: string; status: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/95 p-4 backdrop-blur">
        <span className="text-sm text-slate-600"><strong>{selected.size}</strong> soal dipilih</span>
        <Select value={target} onChange={(e) => setTarget(e.target.value)} className="ml-auto w-72" aria-label="Kuis tujuan">
          <option value="">Pilih kuis tujuan…</option>
          {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}{q.status === "draft" ? " (draft)" : ""}</option>)}
        </Select>
        <Button disabled={!selected.size || !target} loading={pending}
          onClick={() => start(async () => {
            const r = await copyQuestionsToQuiz(target, [...selected]);
            if (r.ok) { toast.success(r.message ?? "Disalin"); setSelected(new Set()); } else toast.error(r.error);
          })}>
          <CopyPlus className="h-4 w-4" /> Salin ke kuis
        </Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {questions.map((q) => (
          <li key={q.id}>
            <label className="flex cursor-pointer gap-4 px-5 py-4 hover:bg-slate-50">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={selected.has(q.id)} onChange={() => toggle(q.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="violet">{QUESTION_TYPE_LABEL[q.type]}</Badge>
                  <Badge>{formatScore(q.points)} poin</Badge>
                  <span className="text-xs text-slate-500">{q.quiz.subject?.name ?? "Tanpa mapel"} · {q.quiz.title}{q.owner ? ` · oleh ${q.owner}` : ""}</span>
                  {q.objective && <Badge tone="green">{q.objective}</Badge>}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium text-slate-800"><MathText text={q.prompt} /></p>
                <p className="mt-1 truncate text-xs text-emerald-700">
                  Kunci: {keySummary(q.type, q.question_options, q.accepted_answers)}
                </p>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
