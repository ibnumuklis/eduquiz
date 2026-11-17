"use client";
import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Clock, MinusCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { gradeAnswer } from "@/features/quizzes/actions";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { QUESTION_TYPE_LABEL } from "@/lib/validations/quiz";
import { cn, formatScore } from "@/lib/utils";
import type { ReviewItem } from "@/types";

function GradeBox({ item, attemptId }: { item: ReviewItem; attemptId: string }) {
  const [value, setValue] = useState(item.answer.points_awarded?.toString() ?? "");
  const [pending, start] = useTransition();
  if (!item.answer.answer_id) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <span className="text-sm font-medium text-amber-800">Nilai manual:</span>
      <Input type="number" min={0} max={item.points} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-24" aria-label="Poin" />
      <span className="text-sm text-amber-800">/ {formatScore(item.points)}</span>
      <Button size="sm" variant="outline" onClick={() => setValue(String(item.points))}>Penuh</Button>
      <Button size="sm" variant="outline" onClick={() => setValue("0")}>Nol</Button>
      <Button size="sm" loading={pending} disabled={value === ""}
        onClick={() => start(async () => {
          const r = await gradeAnswer(item.answer.answer_id!, Number(value), attemptId);
          if (r.ok) toast.success(r.message ?? "Tersimpan"); else toast.error(r.error);
        })}>
        Simpan nilai
      </Button>
    </div>
  );
}

export function ReviewList({ items, showKeys, attemptId, canGrade = false }: { items: ReviewItem[]; showKeys: boolean; attemptId: string; canGrade?: boolean }) {
  return (
    <ol className="space-y-4">
      {items.map((it, i) => {
        const a = it.answer;
        const answered = a.selected_option_ids.length > 0 || (a.text_answer ?? "").trim() !== "";
        const state = a.needs_manual_grading ? "pending" : !answered ? "empty" : a.is_correct ? "correct" : (a.points_awarded ?? 0) > 0 ? "partial" : "wrong";
        const meta = {
          correct: { icon: CheckCircle2, cls: "text-emerald-600", label: "Benar", tone: "green" as const },
          partial: { icon: MinusCircle, cls: "text-amber-500", label: "Sebagian benar", tone: "amber" as const },
          wrong: { icon: XCircle, cls: "text-rose-500", label: "Salah", tone: "red" as const },
          empty: { icon: Circle, cls: "text-slate-300", label: "Tidak dijawab", tone: "slate" as const },
          pending: { icon: Clock, cls: "text-amber-500", label: "Menunggu koreksi", tone: "amber" as const },
        }[state];
        return (
          <li key={it.id} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <meta.icon className={cn("h-5 w-5", meta.cls)} />
                <span className="text-sm font-bold text-slate-800">Soal {i + 1}</span>
                <span className="text-xs text-slate-500">{QUESTION_TYPE_LABEL[it.type]}</span>
              </div>
              <Badge tone={meta.tone}>{meta.label} · {a.points_awarded === null ? "?" : formatScore(a.points_awarded)}/{formatScore(it.points)}</Badge>
            </div>
            <p className="mt-3 whitespace-pre-wrap font-medium text-slate-800">{it.prompt}</p>
            {it.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt="Gambar soal" className="mt-3 max-h-60 rounded-xl border border-slate-200" />
            )}
            {it.options.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {it.options.map((o, k) => {
                  const picked = a.selected_option_ids.includes(o.id);
                  return (
                    <li key={o.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                      showKeys && o.is_correct ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : picked ? (showKeys ? "border-rose-300 bg-rose-50 text-rose-800" : "border-brand-300 bg-brand-50 text-brand-800")
                        : "border-slate-100 text-slate-600")}>
                      <span className="text-xs font-bold opacity-60">{String.fromCharCode(65 + k)}</span>
                      <span className="flex-1">{o.label}</span>
                      {picked && <Badge tone="brand">Jawaban Anda</Badge>}
                      {showKeys && o.is_correct && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <p className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">Jawaban: </span><span className="whitespace-pre-wrap font-medium text-slate-800">{a.text_answer || "—"}</span></p>
                {showKeys && it.accepted_answers && it.accepted_answers.length > 0 && (
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><span className="opacity-70">Kunci: </span>{it.accepted_answers.join(" / ")}</p>
                )}
              </div>
            )}
            {showKeys && it.explanation && (
              <div className="mt-3 rounded-xl border-l-4 border-brand-400 bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-700">Pembahasan</p>
                <p className="whitespace-pre-wrap">{it.explanation}</p>
              </div>
            )}
            {canGrade && it.options.length === 0 && answered && <GradeBox item={it} attemptId={attemptId} />}
          </li>
        );
      })}
    </ol>
  );
}
