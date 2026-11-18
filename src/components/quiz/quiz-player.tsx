"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BookText, CheckCircle2, ChevronLeft, ChevronRight, CloudOff, Divide, Flag, Lightbulb, Loader2,
  RefreshCcw, RotateCcw, Send, ShieldCheck, Target, Timer, Wifi, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/feedback";
import { cn, formatDuration } from "@/lib/utils";
import { dbErrorMessage } from "@/lib/utils/errors";
import { CHEERS, ENCOURAGE, pickLine } from "@/lib/utils/quiz";
import { QUESTION_TYPE_LABEL, SURVEY_TYPES } from "@/lib/validations/quiz";
import { QuestionInput, isAnswered, type Answer } from "./question-input";
import { FullscreenGate, IntegrityBadge, IntegrityWarning, Watermark, useIntegrity } from "./integrity";
import { ReadAloudButton } from "./read-aloud";
import { MathText } from "./math-text";
import { QuestionAudio } from "./audio-player";
import { SPEECH_LANG } from "@/lib/validations/quiz";
import type { AttemptPayload, AttemptQuestion, PowerupKind } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
interface Feedback {
  graded: boolean;
  is_correct?: boolean | null;
  can_retry?: boolean;
  key?: { correct_option_ids?: string[]; grid?: Record<string, boolean>; matches?: Record<string, string>; order?: string[]; accepted_answers?: string[] } | null;
  explanation?: string | null;
}

const backupKey = (id: string) => `eq-attempt-${id}`;

function speakableText(q: AttemptQuestion) {
  const opts = q.options.map((o, i) => `${q.type === "ordering" || q.type === "tf_grid" ? i + 1 : String.fromCharCode(65 + i)}. ${o.label}`).join(". ");
  return [q.stimulus?.content, q.prompt, opts].filter(Boolean).join(". ");
}

function KeyReveal({ q, fb }: { q: AttemptQuestion; fb: Feedback }) {
  const k = fb.key;
  if (!k) return null;
  const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? "—";
  let text = "";
  if (k.correct_option_ids) text = k.correct_option_ids.map(label).join(", ");
  else if (k.grid) text = q.options.map((o, i) => `${i + 1}. ${k.grid![o.id] ? "Benar" : "Salah"}`).join(" · ");
  else if (k.matches) text = q.options.map((o) => `${o.label} → ${k.matches![o.id]}`).join(" · ");
  else if (k.order) text = k.order.map(label).join(" → ");
  else if (k.accepted_answers) text = k.accepted_answers.join(" / ");
  return text ? <p className="mt-2 text-sm"><span className="opacity-70">Jawaban benar: </span><strong>{text}</strong></p> : null;
}

export function QuizPlayer({ payload, preview = false }: { payload: AttemptPayload; preview?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);
  const attemptId = payload.attempt.id;
  const quiz = payload.quiz;
  const mode = quiz.mode ?? "standard";
  const powerupsOn = !preview && !!quiz.powerups_enabled && mode !== "exam";
  const instantOn = !preview && !!quiz.instant_feedback && mode !== "exam";

  const [questions, setQuestions] = useState<AttemptQuestion[]>(payload.questions);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(payload.answers ?? {});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [online, setOnline] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>(() => {
    const init: Record<string, Feedback> = {};
    Object.entries(payload.answers ?? {}).forEach(([qid, a]) => { if (a.locked) init[qid] = { graded: a.is_correct !== null && a.is_correct !== undefined, is_correct: a.is_correct }; });
    return init;
  });
  const [checking, setChecking] = useState(false);
  const [used, setUsed] = useState<Set<PowerupKind>>(new Set(payload.attempt.powerups_used ?? []));
  const [powerBusy, setPowerBusy] = useState(false);

  const integrity = useIntegrity({
    supabase,
    attemptId,
    requireFullscreen: !!quiz.require_fullscreen,
    detectTabSwitch: quiz.detect_tab_switch ?? true,
    blockClipboard: mode === "exam",
    initialCount: payload.attempt.integrity_count ?? 0,
    active: !preview,
    alarm: quiz.integrity_alarm ?? true,
  });

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
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
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
          p_data: answer.answer_data ?? null,
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
      const ids = new Set(payload.questions.map((q) => q.id));
      Object.entries(saved).forEach(([qid, a]) => {
        if (ids.has(qid) && !payload.answers?.[qid]?.locked) pending.current.set(qid, a);
      });
      if (pending.current.size) {
        setAnswers((prev) => ({ ...prev, ...Object.fromEntries(pending.current) }));
        flush();
      }
    } catch { /* ignore corrupt backup */ }
  }, [attemptId, payload.questions, payload.answers, flush, preview]);

  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => { setOnline(false); setSaveState("offline"); };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

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

  useEffect(() => {
    if (!preview && remaining === 0 && !submitted.current) submit(true);
  }, [remaining, preview, submit]);

  const q: AttemptQuestion | undefined = questions[index];
  const answeredCount = questions.filter((x) => isAnswered(answers[x.id])).length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  function change(next: Answer, delay: number) {
    if (!q || answers[q.id]?.locked) return;
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    queueSave(q.id, next, delay);
  }

  async function check() {
    if (!supabase || !q) return;
    setChecking(true);
    clearTimeout(timers.current.get(q.id));
    await flush();
    if (pending.current.has(q.id)) { setChecking(false); toast.error("Jawaban belum tersimpan. Periksa koneksi."); return; }
    const { data, error } = await supabase.rpc("check_answer", { p_attempt: attemptId, p_question: q.id });
    setChecking(false);
    if (error) return toast.error(dbErrorMessage(error));
    const fb = data as Feedback & { expired?: boolean };
    if (fb.expired) { submitted.current = true; goToResult(); return; }
    setFeedback((f) => ({ ...f, [q.id]: fb }));
    setAnswers((prev) => ({ ...prev, [q.id]: { ...prev[q.id], locked: true, is_correct: fb.is_correct } }));
  }

  async function powerup(kind: PowerupKind) {
    if (!supabase || !q || used.has(kind)) return;
    setPowerBusy(true);
    await flush();
    const { data, error } = await supabase.rpc("use_powerup", { p_attempt: attemptId, p_question: q.id, p_kind: kind });
    setPowerBusy(false);
    if (error) return toast.error(dbErrorMessage(error));
    setUsed((s) => new Set(s).add(kind));
    const res = data as { hidden?: string[]; hint?: string; unlocked?: boolean };
    if (kind === "fifty_fifty" && res.hidden) {
      const hide = new Set(res.hidden);
      setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, options: x.options.filter((o) => !hide.has(o.id)) } : x)));
      setAnswers((prev) => {
        const cur = prev[q.id];
        return cur && cur.selected_option_ids.some((id) => hide.has(id)) ? { ...prev, [q.id]: { ...cur, selected_option_ids: [] } } : prev;
      });
      toast.success("50:50 — dua jawaban salah dihilangkan");
    } else if (kind === "hint" && res.hint) {
      setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, hint: res.hint } : x)));
    } else if (kind === "second_chance") {
      setFeedback((f) => { const n = { ...f }; delete n[q.id]; return n; });
      setAnswers((prev) => ({ ...prev, [q.id]: { ...prev[q.id], locked: false, is_correct: null } }));
      toast.success("Kesempatan kedua! Coba jawab lagi.");
    }
  }

  if (!q) return null;
  const a = answers[q.id];
  const fb = feedback[q.id];
  const locked = !!a?.locked;
  const low = remaining <= 60;
  const theme = quiz.theme ?? "default";
  const dark = theme === "angkasa";
  const showGate = !preview && integrity.needFullscreen;
  const readAloudPreferred = !!payload.student?.read_aloud;

  return (
    <div className={cn("min-h-dvh", `quiz-theme-${theme}`)}>
      {showGate && <FullscreenGate onEnter={integrity.enterFullscreen} returning={integrity.count > 0} />}
      {!preview && integrity.warning && !showGate && (
        <IntegrityWarning reason={integrity.warning} count={integrity.count} onClose={integrity.dismissWarning} />
      )}
      {!preview && quiz.show_watermark && (
        <Watermark text={`${payload.student?.full_name ?? "Siswa"}${payload.student?.student_number ? ` · ${payload.student.student_number}` : ""}`} />
      )}
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-28 pt-4 sm:px-6 lg:pb-8">
        <header className={cn("sticky top-0 z-10 -mx-4 mb-4 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6",
          dark ? "border-white/10 bg-slate-900/85 text-slate-100" : "border-slate-200/70 bg-white/90")}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={cn("flex items-center gap-2 text-xs font-medium", dark ? "text-slate-300" : "text-slate-500")}>
                {preview ? "Preview guru" : `Percobaan ke-${payload.attempt.attempt_number}`}
                {mode === "exam" && <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-white"><ShieldCheck className="h-3 w-3" /> Ujian</span>}
                {mode === "practice" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700"><Target className="h-3 w-3" /> Latihan</span>}
              </p>
              <h1 className={cn("truncate text-base font-bold sm:text-lg", dark ? "text-white" : "text-slate-900")}>{quiz.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <IntegrityBadge count={integrity.count} />
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
                <Timer className="h-4 w-4" /> {preview ? `${quiz.duration_minutes}:00` : formatDuration(remaining)}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar value={progress} />
            <span className={cn("shrink-0 text-xs font-semibold", dark ? "text-slate-200" : "text-slate-600")}>{answeredCount}/{questions.length}</span>
          </div>
        </header>

        {payload.attempt.is_remedial && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <RefreshCcw className="h-4 w-4" /> Latihan ulang: hanya soal yang belum kamu kuasai. Semangat!
          </div>
        )}
        {(payload.attempt.time_multiplier ?? 1) > 1 && !preview && (
          <p className="mb-3 text-xs text-violet-700">Waktu pengerjaanmu disesuaikan ×{payload.attempt.time_multiplier}.</p>
        )}
        {(!online || saveState === "offline") && !preview && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            <AlertTriangle className="h-4 w-4" /> Koneksi terputus. Lanjutkan mengerjakan — jawaban akan dikirim otomatis saat online.
          </div>
        )}

        <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_280px]">
          <section className="animate-fade-in" key={q.id} aria-labelledby="q-title">
            {q.stimulus && (
              <details open className="mb-4 rounded-3xl border border-violet-200 bg-violet-50/70 p-5 shadow-sm">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-violet-900">
                  <BookText className="h-4 w-4" /> {q.stimulus.title || "Bacaan / stimulus"}
                </summary>
                <div className="mt-3 max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800 sm:text-base"><MathText text={q.stimulus.content} /></div>
                {q.stimulus.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.stimulus.image_url} alt="Gambar stimulus" className="mt-3 max-h-80 rounded-2xl border border-violet-200 object-contain" />
                )}
              </details>
            )}
            <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">Soal {index + 1} dari {questions.length}</span>
                <div className="flex items-center gap-2">
                  <ReadAloudButton text={speakableText(q)} prominent={readAloudPreferred} autoKey={readAloudPreferred ? q.id : undefined} lang={SPEECH_LANG[quiz.language ?? "id"]} />
                  <span className="text-xs text-slate-500">{QUESTION_TYPE_LABEL[q.type]}{SURVEY_TYPES.has(q.type) ? "" : ` · ${Number(q.points)} poin`}</span>
                </div>
              </div>
              <h2 id="q-title" className="mt-4 whitespace-pre-wrap text-lg font-semibold leading-relaxed text-slate-900"><MathText text={q.prompt} /></h2>
              {q.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.image_url} alt="Gambar soal" className="mt-4 max-h-80 rounded-2xl border border-slate-200 object-contain" />
              )}
              {q.audio_url && <QuestionAudio key={q.id} src={q.audio_url} maxPlays={preview ? 0 : q.audio_max_plays ?? 0} storageKey={preview ? undefined : `eq-audio-${attemptId}-${q.id}`} />}
              {q.type === "multiple_select" && <p className="mt-2 text-sm text-violet-600">Pilih semua jawaban yang benar.</p>}
              {q.type === "tf_grid" && <p className="mt-2 text-sm text-violet-600">Tentukan Benar atau Salah untuk setiap pernyataan.</p>}
              {q.type === "matching" && <p className="mt-2 text-sm text-violet-600">Pasangkan setiap pernyataan dengan jawaban yang sesuai.</p>}
              {q.type === "ordering" && <p className="mt-2 text-sm text-violet-600">Susun dengan tombol panah hingga urutannya benar.</p>}
              {SURVEY_TYPES.has(q.type) && <p className="mt-2 text-sm text-slate-500">Survei kelas — tidak dinilai. Jawab dengan jujur ya!</p>}
              {q.type === "essay" && q.rubric && q.rubric.length > 0 && (
                <div className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide">Yang dinilai guru</p>
                  <ul className="list-inside list-disc space-y-0.5">{q.rubric.map((r, i) => <li key={i}>{r.criterion} <span className="opacity-60">({r.points} poin)</span></li>)}</ul>
                </div>
              )}
              {q.hint && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> {q.hint}</p>
              )}

              <div className="mt-6">
                <QuestionInput q={q} answer={a} onChange={change} disabled={locked} />
              </div>

              {fb && (
                <div className={cn("animate-celebrate mt-5 rounded-2xl px-4 py-3",
                  !fb.graded ? "bg-slate-100 text-slate-700" : fb.is_correct ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")} role="status">
                  <p className="flex items-center gap-2 font-bold">
                    {!fb.graded ? <><CheckCircle2 className="h-5 w-5" /> Jawaban terkunci{SURVEY_TYPES.has(q.type) ? "" : " — dinilai guru"}</>
                      : fb.is_correct ? <><CheckCircle2 className="h-5 w-5" /> Benar! {mode !== "exam" && pickLine(CHEERS, q.id)}</>
                      : <><XCircle className="h-5 w-5" /> Belum tepat. {pickLine(ENCOURAGE, q.id)}</>}
                  </p>
                  <KeyReveal q={q} fb={fb} />
                  {fb.explanation && <p className="mt-2 whitespace-pre-wrap text-sm opacity-90"><MathText text={fb.explanation} /></p>}
                  {fb.can_retry && powerupsOn && !used.has("second_chance") && (
                    <Button size="sm" variant="outline" className="mt-3" loading={powerBusy} onClick={() => powerup("second_chance")}>
                      <RotateCcw className="h-4 w-4" /> Pakai Kesempatan Kedua
                    </Button>
                  )}
                </div>
              )}

              {(instantOn || powerupsOn) && (
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {instantOn && !locked && (
                    <Button size="sm" variant="secondary" loading={checking} disabled={!isAnswered(a)} onClick={check}>
                      <CheckCircle2 className="h-4 w-4" /> Periksa jawaban
                    </Button>
                  )}
                  {powerupsOn && (
                    <>
                      <span className="ml-auto text-xs font-semibold text-slate-400">Power-up:</span>
                      <Button size="sm" variant="outline" disabled={used.has("fifty_fifty") || q.type !== "multiple_choice" || locked || powerBusy || q.options.length < 3}
                        onClick={() => powerup("fifty_fifty")} title="Hilangkan dua jawaban salah (sekali per kuis)">
                        <Divide className="h-4 w-4" /> 50:50
                      </Button>
                      <Button size="sm" variant="outline" disabled={used.has("hint") || !q.has_hint || !!q.hint || powerBusy}
                        onClick={() => powerup("hint")} title="Tampilkan petunjuk dari guru (sekali per kuis)">
                        <Lightbulb className="h-4 w-4" /> Petunjuk
                      </Button>
                      {instantOn && (
                        <span className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs", used.has("second_chance") ? "text-slate-300 line-through" : "text-slate-500")} title="Dipakai setelah jawaban diperiksa dan salah">
                          <RotateCcw className="h-3.5 w-3.5" /> Kesempatan kedua
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button>
              <Button variant="ghost" onClick={() => setFlagged((f) => { const n = new Set(f); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                className={cn("bg-white/70", flagged.has(q.id) ? "text-amber-600" : "")} aria-pressed={flagged.has(q.id)}>
                <Flag className="h-4 w-4" /> <span className="hidden sm:inline">{flagged.has(q.id) ? "Ditandai" : "Tandai ragu"}</span>
              </Button>
              {index < questions.length - 1 ? (
                <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>Berikutnya <ChevronRight className="h-4 w-4" /></Button>
              ) : (
                <Button variant="accent" onClick={() => setConfirmOpen(true)}><Send className="h-4 w-4" /> Kumpulkan</Button>
              )}
            </div>
          </section>

          <aside className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 lg:static lg:h-fit lg:rounded-3xl lg:border lg:p-5 lg:shadow-sm">
            <p className="mb-3 hidden text-sm font-semibold text-slate-800 lg:block">Navigasi soal</p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
              {questions.map((x, i) => {
                const done = isAnswered(answers[x.id]);
                const f = feedback[x.id];
                return (
                  <button
                    key={x.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Soal ${i + 1}${done ? ", terjawab" : ""}${flagged.has(x.id) ? ", ditandai" : ""}`}
                    aria-current={i === index ? "step" : undefined}
                    className={cn(
                      "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold transition",
                      i === index ? "ring-2 ring-brand-500 ring-offset-2" : "",
                      f?.graded ? (f.is_correct ? "bg-emerald-500 text-white" : "bg-rose-500 text-white")
                        : done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
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
              {instantOn && <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-500" /> Benar / <span className="h-3 w-3 rounded bg-rose-500" /> Salah</p>}
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
    </div>
  );
}
