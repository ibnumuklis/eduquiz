"use client";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, GripVertical, Square, SquareCheck } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { AttemptAnswer, AttemptQuestion } from "@/types";
import { MathText } from "./math-text";

export type Answer = AttemptAnswer;

export const isAnswered = (a?: Answer | null) =>
  Boolean(a && (a.selected_option_ids.length > 0 || (a.text_answer ?? "").trim() !== "" || (a.answer_data && Object.keys(a.answer_data).length > 0)));

const empty: Answer = { selected_option_ids: [], text_answer: null, answer_data: null };

/**
 * Renders the answer control for every question type. `onChange(next, delayMs)` is called with the
 * full next answer; the player decides when to persist it.
 */
export function QuestionInput({
  q,
  answer,
  onChange,
  disabled = false,
}: {
  q: AttemptQuestion;
  answer: Answer | undefined;
  onChange: (next: Answer, delay: number) => void;
  disabled?: boolean;
}) {
  const a = answer ?? empty;

  if (q.type === "tf_grid") {
    const data = (a.answer_data ?? {}) as Record<string, boolean>;
    const set = (id: string, v: boolean) => onChange({ ...empty, answer_data: { ...data, [id]: v } }, 150);
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[1fr_auto] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>Pernyataan</span><span className="w-36 text-center">Jawaban</span>
        </div>
        {q.options.map((o, i) => (
          <div key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-slate-100 px-4 py-3">
            <span className="text-sm text-slate-800 sm:text-base"><span className="mr-2 font-bold text-slate-400">{i + 1}.</span><MathText text={o.label} /></span>
            <div className="flex w-36 overflow-hidden rounded-xl border border-slate-200 text-sm font-semibold" role="radiogroup" aria-label={`Pernyataan ${i + 1}`}>
              {[true, false].map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={data[o.id] === v} disabled={disabled}
                  onClick={() => set(o.id, v)}
                  className={cn("flex-1 py-2 transition disabled:cursor-not-allowed",
                    data[o.id] === v ? (v ? "bg-emerald-600 text-white" : "bg-rose-500 text-white") : "bg-white text-slate-600 hover:bg-slate-50")}>
                  {v ? "Benar" : "Salah"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (q.type === "matching") {
    const data = (a.answer_data ?? {}) as Record<string, string>;
    const choices = q.right_choices ?? [];
    const set = (id: string, v: string) => {
      const next = { ...data };
      if (v) next[id] = v; else delete next[id];
      onChange({ ...empty, answer_data: next }, 150);
    };
    return (
      <div className="space-y-2.5">
        {q.options.map((o, i) => (
          <div key={o.id} className="grid items-center gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto_1fr]">
            <span className="text-sm font-medium text-slate-800 sm:text-base"><span className="mr-2 font-bold text-slate-400">{String.fromCharCode(65 + i)}.</span><MathText text={o.label} /></span>
            <span className="hidden text-slate-300 sm:block" aria-hidden>⟷</span>
            <Select value={data[o.id] ?? ""} onChange={(e) => set(o.id, e.target.value)} disabled={disabled} aria-label={`Pasangan untuk ${o.label}`}
              className={cn(data[o.id] && "border-brand-300 bg-brand-50 font-medium text-brand-800")}>
              <option value="">— Pilih pasangan —</option>
              {choices.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        ))}
      </div>
    );
  }

  if (q.type === "ordering") {
    const ids = q.options.map((o) => o.id);
    const order = a.selected_option_ids.length === ids.length && a.selected_option_ids.every((id) => ids.includes(id)) ? a.selected_option_ids : ids;
    const byId = new Map(q.options.map((o) => [o.id, o]));
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      onChange({ ...empty, selected_option_ids: next }, 300);
    };
    return (
      <div>
        <ol className="space-y-2">
          {order.map((id, i) => (
            <li key={id} className={cn("flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 transition", isAnswered(a) ? "border-brand-200 bg-brand-50/50" : "border-slate-200")}>
              <GripVertical className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <span className="flex-1 text-sm text-slate-800 sm:text-base"><MathText text={byId.get(id)?.label} /></span>
              <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} className="rounded-lg p-2 text-slate-500 hover:bg-white disabled:opacity-30" aria-label={`Naikkan ${byId.get(id)?.label}`}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === order.length - 1} className="rounded-lg p-2 text-slate-500 hover:bg-white disabled:opacity-30" aria-label={`Turunkan ${byId.get(id)?.label}`}><ArrowDown className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>
        {!isAnswered(a) && !disabled && (
          <button type="button" onClick={() => onChange({ ...empty, selected_option_ids: order }, 100)} className="mt-3 text-sm font-semibold text-brand-700 hover:underline">
            Urutan ini sudah benar menurut saya → simpan
          </button>
        )}
      </div>
    );
  }

  if (q.options.length > 0) {
    const multi = q.type === "multiple_select";
    const choose = (id: string) => {
      const cur = a.selected_option_ids;
      const selected = multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id];
      onChange({ ...empty, selected_option_ids: selected }, 150);
    };
    return (
      <div className="grid gap-3" role={multi ? "group" : "radiogroup"} aria-labelledby="q-title">
        {q.options.map((o, i) => {
          const on = a.selected_option_ids.includes(o.id);
          const Icon = multi ? (on ? SquareCheck : Square) : on ? CheckCircle2 : Circle;
          return (
            <button key={o.id} type="button" role={multi ? "checkbox" : "radio"} aria-checked={on} onClick={() => choose(o.id)} disabled={disabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm transition active:scale-[0.99] disabled:cursor-not-allowed sm:text-base",
                on ? "border-brand-500 bg-brand-50 font-semibold text-brand-800 shadow-sm" : "border-slate-200 text-slate-700 hover:border-brand-200 hover:bg-slate-50",
              )}>
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold", on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1"><MathText text={o.label} /></span>
              <Icon className={cn("h-5 w-5 shrink-0", on ? "text-brand-600" : "text-slate-300")} aria-hidden />
            </button>
          );
        })}
      </div>
    );
  }

  const typeText = (text: string, delay: number) => onChange({ ...empty, text_answer: text }, delay);
  if (q.type === "essay") {
    const words = (a.text_answer ?? "").trim().split(/\s+/).filter(Boolean).length;
    return (
      <div>
        <Textarea value={a.text_answer ?? ""} onChange={(e) => typeText(e.target.value, 1200)} disabled={disabled} rows={8} maxLength={5000}
          placeholder="Tulis jawaban uraianmu di sini…" className="text-base" aria-label="Jawaban uraian" />
        <p className="mt-1 text-right text-xs text-slate-400">{words} kata</p>
      </div>
    );
  }
  if (q.type === "fill_blank" || q.type === "word_cloud") {
    return (
      <Input value={a.text_answer ?? ""} onChange={(e) => typeText(e.target.value, 800)} disabled={disabled}
        placeholder={q.type === "word_cloud" ? "Tulis 1–3 kata…" : "Ketik jawaban untuk bagian yang kosong…"}
        className="h-12 text-base" maxLength={q.type === "word_cloud" ? 60 : 500} aria-label="Jawaban" />
    );
  }
  return (
    <Textarea value={a.text_answer ?? ""} onChange={(e) => typeText(e.target.value, 800)} disabled={disabled}
      placeholder="Ketik jawaban Anda…" rows={4} className="text-base" maxLength={5000} aria-label="Jawaban" />
  );
}
