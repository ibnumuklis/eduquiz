"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, ChevronRight, Copy, Eye, Hand, Maximize, Minimize, Pause, Play, Square, Users, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { LiveAnswerMode, LiveState } from "@/features/live/actions";
import { dbErrorMessage } from "@/lib/utils/errors";
import { MathText } from "@/components/quiz/math-text";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ReadAloudButton } from "@/components/quiz/read-aloud";
import { SPEECH_LANG } from "@/lib/validations/quiz";
import type { QuizLanguage } from "@/types";
import { liveRevealText, liveSpeechText, useCountdown, useLive, OPTION_STYLES, TEXT_TYPES } from "./use-live";
import { Leaderboard, LiveShell, Podium, TimerRing } from "./live-shared";

export function LiveHost({ initial }: { initial: LiveState }) {
  const { supabase, state, setState, refresh, ping, connected, serverNow } = useLive(initial.session.id, initial);
  const { phase, left, readLeft } = useCountdown(state, serverNow);
  const [pending, setPending] = useState(false);
  const [full, setFull] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("eq-live-autoread") === "1") setTimeout(() => setAutoRead(true), 0); } catch { /* ignore */ }
  }, []);
  const toggleAutoRead = () => setAutoRead((v) => {
    try { localStorage.setItem("eq-live-autoread", v ? "0" : "1"); } catch { /* ignore */ }
    return !v;
  });
  const speechLang = SPEECH_LANG[(state.quiz.language ?? "id") as QuizLanguage] ?? "id-ID";
  const autoRevealed = useRef<string | null>(null);
  const s = state.session;
  const q = state.question;
  const answered = q?.answered ?? 0;

  const act = useCallback(async (action: "next" | "reveal" | "end" | "open" | "pause" | "resume") => {
    setPending(true);
    // Instant feedback on the projector while the server confirms.
    if (action === "reveal") setState((st) => ({ ...st, session: { ...st.session, status: "reveal", paused: false } }));
    if (action === "end") setState((st) => ({ ...st, session: { ...st.session, status: "ended" } }));
    if (action === "open") setState((st) => ({ ...st, session: { ...st.session, question_started_at: new Date(serverNow()).toISOString() } }));
    const { error } = await supabase.rpc("live_control", { p_session: s.id, p_action: action });
    if (error) toast.error(dbErrorMessage(error));
    ping();          // players refresh immediately
    await refresh(); // and so do we
    setPending(false);
  }, [supabase, s.id, setState, ping, refresh, serverNow]);

  const configure = useCallback(async (mode: LiveAnswerMode, read: number) => {
    setState((st) => ({ ...st, session: { ...st.session, answer_mode: mode, read_seconds: read } }));
    const { error } = await supabase.rpc("live_configure", { p_session: s.id, p_mode: mode, p_read_seconds: read });
    if (error) toast.error(dbErrorMessage(error));
    refresh();
  }, [supabase, s.id, setState, refresh]);
  const mode: LiveAnswerMode = s.answer_mode ?? "auto";
  const readSeconds = s.read_seconds ?? 0;

  // Tampilkan jawaban otomatis saat waktu habis atau semua peserta sudah menjawab.
  useEffect(() => {
    if (s.status !== "question" || !q) return;
    const key = `${s.current_index}`;
    if (autoRevealed.current === key) return;
    if (phase !== "running") return;
    if (left === 0 || (state.players_count > 0 && answered >= state.players_count)) {
      autoRevealed.current = key;
      setTimeout(() => act("reveal"), 300); // short beat so the last answer lands on screen
    }
  }, [phase, left, answered, s.status, s.current_index, q, state.players_count, act]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  const joinUrl = typeof window !== "undefined" ? `${window.location.host}/student/live` : "/student/live";
  const isLast = s.current_index + 1 >= s.total;

  return (
    <LiveShell className="flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-8">
        <Tip content="Kembali ke kuis (sesi Live tetap berjalan)">
          <Link href={`/teacher/quizzes/${state.quiz.id}`} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Tip>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{state.quiz.title}</p>
          <p className="text-xs text-white/60">
            {s.status === "lobby" ? "Menunggu peserta" : s.status === "ended" ? "Selesai" : `Soal ${s.current_index + 1} dari ${s.total}`}
          </p>
        </div>
        <Tip content={connected ? "Tersambung realtime" : "Realtime terputus — memakai penyegaran berkala"}>
          <span className={cn("hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs sm:flex", connected ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{connected ? "Live" : "Polling"}
          </span>
        </Tip>
        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold"><Users className="h-4 w-4" />{state.players_count}</span>
        <Tip content={full ? "Keluar layar penuh" : "Layar penuh untuk proyektor"}>
          <button onClick={toggleFull} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Layar penuh">
            {full ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </Tip>
        {s.status !== "ended" && (
          <Tip content="Akhiri sesi Live dan tampilkan juara">
            <button onClick={() => { if (confirm("Akhiri sesi Live sekarang?")) act("end"); }} className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/80 hover:bg-rose-500" aria-label="Akhiri">
              <Square className="h-4 w-4" />
            </button>
          </Tip>
        )}
      </header>

      <main className="flex flex-1 flex-col px-4 pb-8 sm:px-8">
        {s.status === "lobby" && (
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center text-center">
            <p className="text-lg text-white/70">Buka <b className="text-white">{joinUrl}</b> lalu masukkan kode</p>
            <button onClick={() => { navigator.clipboard?.writeText(s.code); toast.success("Kode disalin"); }}
              className="group mt-4 flex items-center gap-4 rounded-3xl bg-white px-8 py-5 font-mono text-6xl font-black tracking-[0.25em] text-indigo-900 shadow-2xl sm:text-8xl">
              {s.code}<Copy className="h-6 w-6 text-indigo-300 group-hover:text-indigo-600" />
            </button>
            <div className="mt-10 flex max-h-64 w-full flex-wrap justify-center gap-2 overflow-y-auto">
              {(state.players ?? []).map((n, i) => (
                <span key={i} className="animate-in fade-in zoom-in rounded-full bg-white/15 px-4 py-2 font-semibold">{n}</span>
              ))}
              {!state.players?.length && <p className="text-white/60">Menunggu siswa bergabung…</p>}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-white/60">Mulai menjawab:</span>
              <div className="inline-flex rounded-xl bg-white/10 p-1">
                {(["auto", "manual"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => configure(m, readSeconds)}
                    className={cn("rounded-lg px-3 py-1.5 font-semibold transition", mode === m ? "bg-white text-indigo-900" : "text-white/70 hover:text-white")}>
                    {m === "auto" ? "Otomatis" : "Manual (guru)"}
                  </button>
                ))}
              </div>
              {mode === "auto" && (
                <label className="inline-flex items-center gap-2 text-white/60">
                  waktu membaca
                  <select value={readSeconds} onChange={(e) => configure(mode, Number(e.target.value))}
                    className="rounded-lg border-0 bg-white/10 px-2 py-1.5 font-semibold text-white [&>option]:text-slate-900">
                    {[0, 3, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n ? `${n} detik` : "tanpa jeda"}</option>)}
                  </select>
                </label>
              )}
            </div>
            <button disabled={pending || state.players_count === 0} onClick={() => act("next")}
              className="mt-10 flex items-center gap-2 rounded-2xl bg-emerald-500 px-10 py-4 text-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 disabled:opacity-50">
              Mulai <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        )}

        {(s.status === "question" || s.status === "reveal") && q && (
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
            <div className="flex items-start gap-6">
              <div className="flex-1 rounded-3xl bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
                <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                  {s.status === "question" ? (
                    <ReadAloudButton key={`q-${q.id}`} text={liveSpeechText(q)} lang={speechLang}
                      prominent={autoRead} autoKey={autoRead ? `${s.id}-${s.current_index}` : undefined} />
                  ) : liveRevealText(q, speechLang) ? (
                    <ReadAloudButton key={`r-${q.id}`} text={liveRevealText(q, speechLang)} lang={speechLang} />
                  ) : null}
                  <Tip content="Bacakan soal & pilihan otomatis setiap soal baru tampil">
                    <button type="button" onClick={toggleAutoRead} aria-pressed={autoRead}
                      className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        autoRead ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                      Otomatis {autoRead ? "aktif" : "mati"}
                    </button>
                  </Tip>
                </div>
                <MathText text={q.prompt} className="whitespace-pre-wrap text-2xl font-bold leading-snug sm:text-3xl" />
                {q.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.image_url} alt="" className="mx-auto mt-4 max-h-64 rounded-2xl object-contain" />
                )}
              </div>
              <div className="flex flex-col items-center gap-3">
                {phase === "running" && left !== null && <TimerRing left={left} total={s.question_seconds} size={104} />}
                {phase === "paused" && left !== null && (
                  <div className="relative"><TimerRing left={left} total={s.question_seconds} size={104} />
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">JEDA</span></div>
                )}
                {phase === "reading" && readLeft !== null && (
                  <div className="relative"><TimerRing left={readLeft} total={Math.max(1, readSeconds)} size={104} />
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-sky-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">BACA</span></div>
                )}
                {phase === "waiting" && (
                  <div className="grid h-[104px] w-[104px] place-items-center rounded-full bg-white/10 text-center text-xs font-semibold text-white/80">
                    <span><BookOpen className="mx-auto mb-1 h-7 w-7" />Baca soal</span>
                  </div>
                )}
                <div className="rounded-2xl bg-white/10 px-4 py-2 text-center">
                  <p className="text-3xl font-black tabular-nums">{answered}</p>
                  <p className="text-xs text-white/70">menjawab</p>
                </div>
              </div>
            </div>

            {(phase === "waiting" || phase === "reading" || phase === "paused") && (
              <div className={cn("flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-center font-semibold",
                phase === "paused" ? "bg-amber-400/20 text-amber-100" : "bg-sky-400/20 text-sky-100")}>
                {phase === "paused" ? <><Pause className="h-5 w-5" /> Dijeda — siswa belum bisa menjawab</>
                  : phase === "reading" ? <><BookOpen className="h-5 w-5" /> Waktu membaca — menjawab dibuka dalam {readLeft} detik</>
                  : <><Hand className="h-5 w-5" /> Bacakan soal dulu, lalu tekan “Mulai menjawab”</>}
              </div>
            )}

            {TEXT_TYPES.has(q.type) ? (
              <div className="flex flex-1 flex-wrap content-start items-center justify-center gap-3 rounded-3xl bg-white/5 p-6">
                {s.status === "reveal" && q.accepted_answers?.length ? (
                  <p className="w-full text-center text-lg">Jawaban benar: <b className="text-emerald-300">{q.accepted_answers.join(" / ")}</b></p>
                ) : null}
                {s.status === "reveal" ? (q.words ?? []).map((w) => (
                  <span key={w.text} className="rounded-xl bg-white/15 px-3 py-1 font-bold"
                    style={{ fontSize: `${Math.min(3, 1 + w.count * 0.35)}rem` }}>{w.text}</span>
                )) : <p className="text-white/60">Jawaban akan muncul setelah waktu habis.</p>}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {q.options.map((o, i) => {
                  const st = OPTION_STYLES[i % OPTION_STYLES.length];
                  const total = Math.max(1, answered);
                  const reveal = s.status === "reveal";
                  return (
                    <div key={o.id} className={cn("relative overflow-hidden rounded-2xl p-5 text-xl font-bold shadow-lg transition-opacity", st.bg,
                      reveal && q.type !== "poll" && !o.is_correct && "opacity-40")}>
                      {reveal && <div className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${((o.count ?? 0) / total) * 100}%` }} />}
                      <div className="relative flex items-center gap-3">
                        <span className="text-2xl">{st.shape}</span>
                        <MathText text={o.label} className="flex-1" />
                        {reveal && <span className="font-mono">{o.count ?? 0}</span>}
                        {reveal && o.is_correct && q.type !== "poll" && <Check className="h-7 w-7" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {s.status === "reveal" && (
              <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                {q.explanation ? (
                  <div className="rounded-2xl bg-white/10 p-5"><p className="mb-1 text-sm font-semibold text-white/70">Pembahasan</p><MathText text={q.explanation} className="whitespace-pre-wrap" /></div>
                ) : <div />}
                <div><p className="mb-2 text-sm font-semibold text-white/70">Peringkat sementara</p><Leaderboard rows={state.leaderboard.slice(0, 5)} compact /></div>
              </div>
            )}

            <div className="mt-auto flex flex-wrap justify-end gap-3">
              {(phase === "waiting" || phase === "reading") && (
                <>
                  {phase === "reading" && (
                    <button disabled={pending} onClick={() => act("pause")} className="flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 font-bold hover:bg-white/25 disabled:opacity-50">
                      <Hand className="h-5 w-5" /> Tahan
                    </button>
                  )}
                  <button disabled={pending} onClick={() => act("open")} className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-3 text-lg font-bold hover:bg-emerald-400 disabled:opacity-50">
                    <Play className="h-5 w-5" /> {phase === "reading" ? "Mulai sekarang" : "Mulai menjawab"}
                  </button>
                </>
              )}
              {phase === "running" && (
                <button disabled={pending} onClick={() => act("pause")} className="flex items-center gap-2 rounded-2xl bg-amber-400 px-6 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-50">
                  <Pause className="h-5 w-5" /> Jeda
                </button>
              )}
              {phase === "paused" && (
                <button disabled={pending} onClick={() => act("resume")} className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-3 text-lg font-bold hover:bg-emerald-400 disabled:opacity-50">
                  <Play className="h-5 w-5" /> Lanjutkan
                </button>
              )}
              {(phase === "running" || phase === "paused") && (
                <button disabled={pending} onClick={() => act("reveal")} className="flex items-center gap-2 rounded-2xl bg-white/15 px-6 py-3 font-bold hover:bg-white/25 disabled:opacity-50">
                  <Eye className="h-5 w-5" /> Tampilkan jawaban
                </button>
              )}
              {s.status === "reveal" && (
                <button disabled={pending} onClick={() => act(isLast ? "end" : "next")} className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-3 text-lg font-bold hover:bg-emerald-400 disabled:opacity-50">
                  {isLast ? "Lihat juara" : "Soal berikutnya"} <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}

        {s.status === "ended" && (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10">
            <h1 className="text-4xl font-black">🏆 Juara Live</h1>
            <Podium rows={state.leaderboard} />
            <div className="w-full"><Leaderboard rows={state.leaderboard} /></div>
            <Link href={`/teacher/quizzes/${state.quiz.id}`} className="rounded-2xl bg-white/15 px-6 py-3 font-bold hover:bg-white/25">Kembali ke kuis</Link>
          </div>
        )}
      </main>
    </LiveShell>
  );
}
