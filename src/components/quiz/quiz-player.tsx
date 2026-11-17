"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Circle, CloudOff, Flag, Loader2, Send, Square, SquareCheck, Timer, Wifi } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea, Input } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/feedback";
import { cn, formatDuration } from "@/lib/utils";
import { dbErrorMessage } from "@/lib/utils/errors";
import { QUESTION_TYPE_LABEL } from "@/lib/validations/quiz";
import type { AttemptPayload, AttemptQuestion } from "@/types";

type Answer = { selected_option_ids: string[]; text_answer: string | null };
type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

const isAnswered = (a?: Answer) => Boolean(a && (a.selected_option_ids.length > 0 || (a.text_answer ?? "").trim() !== ""));
const backupKey = (id: string) => `eq-attempt-${id}`;

export function QuizPlayer({ payload, preview = false }: { payload: AttemptPayload; preview?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);
  const attemptId = payload.attempt.id;
  const questions = payload.questions;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(payload.answers ?? {});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [online, setOnline] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Timer synced to server clock ----
  const serverStart = new Date(payload.server_now).getTime();
  const offset = useRef(0);
  const [expiresAt, setExpiresAt] = useState(new Date(payload.attempt.expires_at).getTime());
  const [now, setNow] = useState(serverStart);
  useEffect(() => {
    offset.current = serverStart - Date.now();
    const t = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(t);
  }, [serverStart]);
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

  // ---- Autosave queue (DB is the source of truth; localStorage only buffers unsent answers) ----
  const pending = useRef(new Map<string, Answer>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const flushing = useRef(false);
  const submitted = useRef(false);

  const persistBackup = useCallback(() => {
    if (preview) return;
    try {
      localStorage.setItem(backupKey(attemptId), JSON.stringify(Object.fromEntries(pending.current)));
    } catch { /* storage unavailable */ }
  }, [attemptId, preview]);

  const goToResult = useCallback(() => {
    try { localStorage.removeItem(backupKey(attemptId)); } catch { /* ignore */ }
    router.replace(`/student/results/${attemptId}`);
    router.refresh();
  }, [attemptId, router]);

  const flush = useCallback(async () => {
    if (!supabase || flushing.current || pending.current.size === 0) return;
    flushing.current = true;
    setSaveState("saving");
    try {
      for (const [questionId, answer] of [...pending.current.entries()]) {
        const { data, error } = await supabase.rpc("save_answer", {
          p_attempt: attemptId,
          p_question: questionId,
          p_selected: answer.selected_option_ids,
          p_text: answer.text_answer,
        });
        if (error) {
          const network = !error.code || /fetch|network/i.test(error.message);
          if (network) { setSaveState("offline"); return; }
          if (error.hint === "ALREADY_SUBMITTED") { submitted.current = true; goToResult(); return; }
          pending.current.delete(questionId);
          setSaveState("error");
          toast.error(dbErrorMessage(error));
          continue;
        }
        if (pending.current.get(questionId) === answer) pending.current.delete(questionId);
        if ((data as { expired?: boolean })?.expired) {
          submitted.current = true;
          toast.info("Waktu habis — jawaban Anda telah dikumpulkan otomatis.");
          goToResult();
          return;
        }
      }
      persistBackup();
      setSaveState(pending.current.size ? "saving" : "saved");
    } finally {
      flushing.current = false;
      if (pending.current.size && navigator.onLine) setTimeout(flush, 1500);
    }
  }, [supabase, attemptId, persistBackup, goToResult]);

  const queueSave = useCallback(
    (questionId: string, answer: Answer, delay: number) => {
      if (preview || submitted.current) return;
      pending.current.set(questionId, answer);
      persistBackup();
      clearTimeout(timers.current.get(questionId));
      timers.current.set(questionId, setTimeout(flush, delay));
    },
    [flush, persistBackup, preview],
  );

  // Restore unsent answers after a refresh / crash, then resend them.
  useEffect(() => {
    if (preview) return;
    try {
      const raw = localStorage.getItem(backupKey(attemptId));
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, Answer>;
      const ids = new Set(questions.map((q) => q.id));
      Object.entries(saved).forEach(([qid, a]) => {
        if (ids.has(qid)) pending.current.set(qid, a);
      });
      if (pending.current.size) {
        setAnswers((prev) => ({ ...prev, ...Object.fromEntries(pending.current) }));
        flush();
      }
    } catch { /* ignore corrupt backup */ }
  }, [attemptId, questions, flush, preview]);

  // Connection handling.
  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => { setOnline(false); setSaveState("offline"); };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

  // Lightweight heartbeat (60s) keeps "last active" fresh and resyncs clock/expiry.
  useEffect(() => {
    if (!supabase) return;
    const beat = async () => {
      const { data } = await supabase.rpc("heartbeat_attempt", { p_attempt: attemptId });
      const d = data as { status: string; expires_at: string; server_now: string } | null;
      if (!d) return;
      offset.current = new Date(d.server_now).getTime() - Date.now();
      setExpiresAt(new Date(d.expires_at).getTime());
      if (d.status === "submitted" && !submitted.current) { submitted.current = true; goToResult(); }
    };
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [supabase, attemptId, goToResult]);

  // Warn before leaving with unsent answers.
  useEffect(() => {
    if (preview) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size && !submitted.current) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [preview]);

  const submit = useCallback(
    async (auto = false) => {
      if (preview) { toast.info("Mode preview — jawaban tidak dikumpulkan."); setConfirmOpen(false); return; }
      if (!supabase || submitted.current || submitting) return;
      setSubmitting(true);
      // Make sure every answer reaches the server before grading.
      timers.current.forEach(clearTimeout);
      await flush();
      if (pending.current.size && !auto) {
        setSubmitting(false);
        toast.error("Beberapa jawaban belum tersimpan. Periksa koneksi lalu coba lagi.");
        return;
      }
      const { error } = await supabase.rpc("submit_attempt", { p_attempt: attemptId });
      if (error && !/sudah dikumpulkan/i.test(error.message)) {
        setSubmitting(false);
        toast.error(dbErrorMessage(error));
        return;
      }
      submitted.current = true;
      toast.success(auto ? "Waktu habis — jawaban dikumpulkan otomatis" : "Jawaban berhasil dikumpulkan!");
      goToResult();
    },
    [preview, supabase, submitting, flush, attemptId, goToResult],
  );

  // Auto-submit when time runs out (server enforces the deadline independently).
  useEffect(() => {
    if (!preview && remaining === 0 && !submitted.current) submit(true);
  }, [remaining, preview, submit]);

  const q: AttemptQuestion | undefined = questions[index];
  const answeredCount = questions.filter((x) => isAnswered(answers[x.id])).length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  function choose(optionId: string) {
    if (!q) return;
    const current = answers[q.id]?.selected_option_ids ?? [];
    const selected = q.type === "multiple_select"
      ? current.includes(optionId) ? current.filter((x) => x !== optionId) : [...current, optionId]
      : [optionId];
    const next = { selected_option_ids: selected, text_answer: null };
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    queueSave(q.id, next, 150);
  }
  function typeAnswer(text: string) {
    if (!q) return;
    const next = { selected_option_ids: [], text_answer: text };
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    queueSave(q.id, next, 800);
  }

  if (!q) return null;
  const a = answers[q.id];
  const low = remaining <= 60;

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-28 pt-4 sm:px-6 lg:pb-8">
      {/* Header */}
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200/70 bg-surface/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{preview ? "Preview guru" : `Percobaan ke-${payload.attempt.attempt_number}`}</p>
            <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">{payload.quiz.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("hidden items-center gap-1.5 text-xs font-medium sm:inline-flex",
              saveState === "offline" || !online ? "text-amber-600" : saveState === "error" ? "text-rose-600" : "text-slate-500")}>
              {!online || saveState === "offline" ? <><CloudOff className="h-4 w-4" /> Offline — tersimpan di perangkat</>
                : saveState === "saving" ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</>
                : saveState === "saved" ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Tersimpan</>
                : <><Wifi className="h-4 w-4" /> Online</>}
            </span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-mono text-sm font-bold tabular-nums",
              preview ? "bg-slate-100 text-slate-600" : low ? "animate-pulse bg-rose-100 text-rose-700" : "bg-brand-50 text-brand-700")}
              role="timer" aria-live={low ? "assertive" : "off"} aria-label="Sisa waktu">
              <Timer className="h-4 w-4" /> {preview ? `${payload.quiz.duration_minutes}:00` : formatDuration(remaining)}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={progress} />
          <span className="shrink-0 text-xs font-semibold text-slate-600">{answeredCount}/{questions.length}</span>
        </div>
      </header>

      {(!online || saveState === "offline") && !preview && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          <AlertTriangle className="h-4 w-4" /> Koneksi terputus. Lanjutkan mengerjakan — jawaban akan dikirim otomatis saat online.
        </div>
      )}

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Question */}
        <section className="animate-fade-in" key={q.id} aria-labelledby="q-title">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">Soal {index + 1} dari {questions.length}</span>
              <span className="text-xs text-slate-500">{QUESTION_TYPE_LABEL[q.type]} · {Number(q.points)} poin</span>
            </div>
            <h2 id="q-title" className="mt-4 whitespace-pre-wrap text-lg font-semibold leading-relaxed text-slate-900">{q.prompt}</h2>
            {q.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.image_url} alt="Gambar soal" className="mt-4 max-h-80 rounded-2xl border border-slate-200 object-contain" />
            )}
            {q.type === "multiple_select" && <p className="mt-2 text-sm text-violet-600">Pilih semua jawaban yang benar.</p>}

            <div className="mt-6">
              {q.options.length > 0 ? (
                <div className="grid gap-3" role={q.type === "multiple_select" ? "group" : "radiogroup"} aria-labelledby="q-title">
                  {q.options.map((o, i) => {
                    const on = a?.selected_option_ids.includes(o.id) ?? false;
                    const Icon = q.type === "multiple_select" ? (on ? SquareCheck : Square) : on ? CheckCircle2 : Circle;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role={q.type === "multiple_select" ? "checkbox" : "radio"}
                        aria-checked={on}
                        onClick={() => choose(o.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm transition active:scale-[0.99] sm:text-base",
                          on ? "border-brand-500 bg-brand-50 font-semibold text-brand-800 shadow-sm" : "border-slate-200 text-slate-700 hover:border-brand-200 hover:bg-slate-50",
                        )}
                      >
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold", on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="flex-1">{o.label}</span>
                        <Icon className={cn("h-5 w-5 shrink-0", on ? "text-brand-600" : "text-slate-300")} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ) : q.type === "fill_blank" ? (
                <Input value={a?.text_answer ?? ""} onChange={(e) => typeAnswer(e.target.value)} placeholder="Ketik jawaban untuk bagian yang kosong…" className="h-12 text-base" maxLength={500} aria-label="Jawaban" />
              ) : (
                <Textarea value={a?.text_answer ?? ""} onChange={(e) => typeAnswer(e.target.value)} placeholder="Ketik jawaban Anda…" rows={4} className="text-base" maxLength={5000} aria-label="Jawaban" />
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button>
            <Button variant="ghost" onClick={() => setFlagged((f) => { const n = new Set(f); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
              className={flagged.has(q.id) ? "text-amber-600" : ""} aria-pressed={flagged.has(q.id)}>
              <Flag className="h-4 w-4" /> <span className="hidden sm:inline">{flagged.has(q.id) ? "Ditandai" : "Tandai ragu"}</span>
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>Berikutnya <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button variant="accent" onClick={() => setConfirmOpen(true)}><Send className="h-4 w-4" /> Kumpulkan</Button>
            )}
          </div>
        </section>

        {/* Navigator */}
        <aside className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 lg:static lg:h-fit lg:rounded-3xl lg:border lg:p-5 lg:shadow-sm">
          <p className="mb-3 hidden text-sm font-semibold text-slate-800 lg:block">Navigasi soal</p>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
            {questions.map((x, i) => {
              const done = isAnswered(answers[x.id]);
              return (
                <button
                  key={x.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Soal ${i + 1}${done ? ", terjawab" : ""}${flagged.has(x.id) ? ", ditandai" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold transition",
                    i === index ? "ring-2 ring-brand-500 ring-offset-2" : "",
                    done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {i + 1}
                  {flagged.has(x.id) && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 hidden space-y-1.5 text-xs text-slate-500 lg:block">
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-brand-600" /> Terjawab</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-200" /> Belum dijawab</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> Ditandai ragu</p>
          </div>
          <Button variant="accent" className="mt-3 w-full lg:mt-5" onClick={() => setConfirmOpen(true)} loading={submitting}>
            <Send className="h-4 w-4" /> Kumpulkan jawaban
          </Button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        tone="primary"
        loading={submitting}
        title="Kumpulkan jawaban sekarang?"
        confirmLabel="Ya, kumpulkan"
        description={
          <div className="space-y-2">
            <p>Anda menjawab <strong>{answeredCount}</strong> dari <strong>{questions.length}</strong> soal.</p>
            {answeredCount < questions.length && <p className="text-amber-700">{questions.length - answeredCount} soal belum dijawab.</p>}
            {flagged.size > 0 && <p className="text-amber-700">{flagged.size} soal masih ditandai ragu.</p>}
            <p>Setelah dikumpulkan, jawaban tidak dapat diubah.</p>
          </div>
        }
        onConfirm={() => submit(false)}
      />
    </div>
  );
}
