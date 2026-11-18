"use client";
import { BookText, CheckCircle2, Circle, Clock, MessageSquareText, MinusCircle, Target, Vote, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import { QUESTION_TYPE_LABEL, SURVEY_TYPES } from "@/lib/validations/quiz";
import { cn, formatScore } from "@/lib/utils";
import { GradePanel } from "./grade-panel";
import type { ReviewItem } from "@/types";

const CHOICE = new Set(["multiple_choice", "multiple_select", "true_false", "poll"]);

function answered(it: ReviewItem) {
  const a = it.answer;
  return a.selected_option_ids.length > 0 || (a.text_answer ?? "").trim() !== "" || Boolean(a.answer_data && Object.keys(a.answer_data).length);
}

function AnswerBody({ it, showKeys }: { it: ReviewItem; showKeys: boolean }) {
  const a = it.answer;
  const data = (a.answer_data ?? {}) as Record<string, boolean | string>;

  if (CHOICE.has(it.type)) {
    return (
      <ul className="mt-3 space-y-1.5">
        {it.options.map((o, k) => {
          const picked = a.selected_option_ids.includes(o.id);
          const survey = it.type === "poll";
          return (
            <li key={o.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
              !survey && showKeys && o.is_correct ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : picked ? (!survey && showKeys ? "border-rose-300 bg-rose-50 text-rose-800" : "border-brand-300 bg-brand-50 text-brand-800")
                : "border-slate-100 text-slate-600")}>
              <span className="text-xs font-bold opacity-60">{String.fromCharCode(65 + k)}</span>
              <span className="flex-1">{o.label}</span>
              {picked && <Badge tone="brand">Jawaban</Badge>}
              {!survey && showKeys && o.is_correct && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            </li>
          );
        })}
      </ul>
    );
  }

  if (it.type === "tf_grid") {
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 text-sm">
        <div className="grid grid-cols-[1fr_80px_80px] bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase text-slate-500">
          <span>Pernyataan</span><span className="text-center">Jawaban</span><span className="text-center">{showKeys ? "Kunci" : ""}</span>
        </div>
        {it.options.map((o, i) => {
          const v = data[o.id];
          const ok = showKeys && typeof v === "boolean" && v === o.is_correct;
          return (
            <div key={o.id} className="grid grid-cols-[1fr_80px_80px] items-center border-t border-slate-100 px-3 py-2">
              <span>{i + 1}. {o.label}</span>
              <span className={cn("text-center font-semibold", showKeys ? (ok ? "text-emerald-600" : "text-rose-600") : "text-brand-700")}>
                {typeof v === "boolean" ? (v ? "Benar" : "Salah") : "—"}
              </span>
              <span className="text-center text-emerald-700">{showKeys && o.is_correct !== null ? (o.is_correct ? "Benar" : "Salah") : ""}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (it.type === "matching") {
    return (
      <ul className="mt-3 space-y-1.5 text-sm">
        {it.options.map((o) => {
          const v = data[o.id] as string | undefined;
          const ok = showKeys && v && o.match_text && v.trim().toLowerCase() === o.match_text.trim().toLowerCase();
          return (
            <li key={o.id} className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
              showKeys ? (ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50") : "border-slate-200")}>
              <span className="font-medium">{o.label}</span><span className="text-slate-400">⟷</span>
              <span>{v || "—"}</span>
              {showKeys && !ok && o.match_text && <span className="ml-auto text-xs text-emerald-700">Kunci: {o.match_text}</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  if (it.type === "ordering") {
    const byId = new Map(it.options.map((o) => [o.id, o.label]));
    return (
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-slate-500">Urutan jawaban</p>
          <ol className="space-y-1">
            {a.selected_option_ids.length ? a.selected_option_ids.map((id, i) => (
              <li key={id} className={cn("rounded-lg px-3 py-1.5", showKeys ? (it.options[i]?.id === id ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800") : "bg-slate-50")}>
                {i + 1}. {byId.get(id)}
              </li>
            )) : <li className="text-slate-400">—</li>}
          </ol>
        </div>
        {showKeys && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-slate-500">Urutan benar</p>
            <ol className="space-y-1">{it.options.map((o, i) => <li key={o.id} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-800">{i + 1}. {o.label}</li>)}</ol>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">Jawaban: </span><span className="whitespace-pre-wrap font-medium text-slate-800">{a.text_answer || "—"}</span></p>
      {showKeys && it.accepted_answers && it.accepted_answers.length > 0 && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><span className="opacity-70">Kunci: </span>{it.accepted_answers.join(" / ")}</p>
      )}
    </div>
  );
}

export function ReviewList({ items, showKeys, attemptId, canGrade = false }: { items: ReviewItem[]; showKeys: boolean; attemptId: string; canGrade?: boolean }) {
  const stimKeyOf = (it: ReviewItem) => (it.stimulus ? `${it.stimulus.title}|${it.stimulus.content.slice(0, 40)}` : "");
  return (
    <ol className="space-y-4">
      {items.map((it, i) => {
        const a = it.answer;
        const survey = SURVEY_TYPES.has(it.type);
        const state = survey ? "survey" : a.needs_manual_grading ? "pending" : !answered(it) ? "empty" : a.is_correct ? "correct" : (a.points_awarded ?? 0) > 0 ? "partial" : "wrong";
        const meta = {
          correct: { icon: CheckCircle2, cls: "text-emerald-600", label: "Benar", tone: "green" as const },
          partial: { icon: MinusCircle, cls: "text-amber-500", label: "Sebagian benar", tone: "amber" as const },
          wrong: { icon: XCircle, cls: "text-rose-500", label: "Salah", tone: "red" as const },
          empty: { icon: Circle, cls: "text-slate-300", label: "Tidak dijawab", tone: "slate" as const },
          pending: { icon: Clock, cls: "text-amber-500", label: "Menunggu koreksi", tone: "amber" as const },
          survey: { icon: Vote, cls: "text-violet-500", label: "Survei", tone: "violet" as const },
        }[state];
        const showStim = it.stimulus && (i === 0 || stimKeyOf(items[i - 1]) !== stimKeyOf(it));
        const manualGradable = canGrade && !survey && answered(it) && (it.type === "essay" || it.type === "short_answer" || it.type === "fill_blank");
        return (
          <li key={it.id} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            {showStim && it.stimulus && (
              <details className="mb-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-slate-700">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold text-violet-900"><BookText className="h-4 w-4" /> {it.stimulus.title || "Stimulus"}</summary>
                <p className="mt-2 whitespace-pre-wrap">{it.stimulus.content}</p>
              </details>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <meta.icon className={cn("h-5 w-5", meta.cls)} />
                <span className="text-sm font-bold text-slate-800">Soal {i + 1}</span>
                <span className="text-xs text-slate-500">{QUESTION_TYPE_LABEL[it.type]}</span>
                {it.objective && <Badge tone="green"><Target className="h-3 w-3" /> {it.objective.code}</Badge>}
              </div>
              <Badge tone={meta.tone}>
                {meta.label}{survey ? "" : ` · ${a.points_awarded === null ? "?" : formatScore(a.points_awarded)}/${formatScore(it.points)}`}
              </Badge>
            </div>
            <p className="mt-3 whitespace-pre-wrap font-medium text-slate-800">{it.prompt}</p>
            {it.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt="Gambar soal" className="mt-3 max-h-60 rounded-xl border border-slate-200" />
            )}
            <AnswerBody it={it} showKeys={showKeys} />
            {a.teacher_feedback && (
              <div className="mt-3 flex gap-2 rounded-xl border-l-4 border-violet-400 bg-violet-50/70 px-4 py-3 text-sm text-slate-700">
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <div><p className="text-xs font-bold uppercase tracking-wide text-violet-700">Catatan guru</p><p className="whitespace-pre-wrap">{a.teacher_feedback}</p></div>
              </div>
            )}
            {showKeys && it.explanation && (
              <div className="mt-3 rounded-xl border-l-4 border-brand-400 bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-700">Pembahasan</p>
                <p className="whitespace-pre-wrap">{it.explanation}</p>
              </div>
            )}
            {manualGradable && a.answer_id && (
              <div className="mt-3">
                <GradePanel answerId={a.answer_id} attemptId={attemptId} maxPoints={Number(it.points)} rubric={it.rubric}
                  initialPoints={a.points_awarded} initialFeedback={a.teacher_feedback} initialRubric={a.rubric_scores} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
