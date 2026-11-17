"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { gradeAnswer } from "@/features/quizzes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { formatScore } from "@/lib/utils";

export interface PendingAnswer {
  id: string;
  attempt_id: string;
  text_answer: string | null;
  question: { prompt: string; points: number; accepted_answers: string[]; quiz: { id: string; title: string } };
  student: { full_name: string } | null;
}

function Row({ a }: { a: PendingAnswer }) {
  const [value, setValue] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return null;
  const save = (v: number) => start(async () => {
    const r = await gradeAnswer(a.id, v, a.attempt_id);
    if (r.ok) { toast.success(r.message ?? "OK"); setDone(true); } else toast.error(r.error);
  });
  return (
    <li className="grid gap-4 p-5 md:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">
          <Link href={`/teacher/attempts/${a.attempt_id}`} className="font-semibold text-brand-600 hover:underline">{a.student?.full_name ?? "Siswa"}</Link> · {a.question.quiz.title}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{a.question.prompt}</p>
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">{a.text_answer || "—"}</p>
        {a.question.accepted_answers.length > 0 && <p className="mt-1 text-xs text-emerald-700">Kunci acuan: {a.question.accepted_answers.join(" / ")}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Input type="number" min={0} max={a.question.points} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-24" aria-label="Poin" />
        <span className="text-sm text-slate-500">/ {formatScore(a.question.points)}</span>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => save(Number(a.question.points))}>Benar</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => save(0)}>Salah</Button>
        <Button size="sm" loading={pending} disabled={value === ""} onClick={() => save(Number(value))}>Simpan</Button>
      </div>
    </li>
  );
}

export function GradingQueue({ rows }: { rows: PendingAnswer[] }) {
  return <ul className="divide-y divide-slate-100">{rows.map((a) => <Row key={a.id} a={a} />)}</ul>;
}
