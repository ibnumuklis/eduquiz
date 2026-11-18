"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import type { LiveState } from "@/features/live/actions";
import { dbErrorMessage } from "@/lib/utils/errors";
import { MathText } from "@/components/quiz/math-text";
import { cn } from "@/lib/utils";
import { ReadAloudButton } from "@/components/quiz/read-aloud";
import { SPEECH_LANG } from "@/lib/validations/quiz";
import type { QuizLanguage } from "@/types";
import { liveRevealText, liveSpeechText, useCountdown, useLive, OPTION_STYLES, TEXT_TYPES } from "./use-live";
import { Leaderboard, LiveShell, Podium, TimerRing } from "./live-shared";

export function LivePlayer({ initial }: { initial: LiveState }) {
  const { supabase, state, refresh, ping, serverNow } = useLive(initial.session.id, initial);
  const left = useCountdown(state, serverNow);
  const [pending, setPending] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sentFor, setSentFor] = useState<number | null>(null);
  const lastIndex = useRef(state.session.current_index);
  const s = state.session;
  const q = state.question;
  const me = state.me;
  const speechLang = SPEECH_LANG[(state.quiz.language ?? "id") as QuizLanguage] ?? "id-ID";

  useEffect(() => {
    if (lastIndex.current !== s.current_index) {
      lastIndex.current = s.current_index;
      setPicked([]); setText("");
      navigator.vibrate?.(60);
    }
  }, [s.current_index]);

  const answered = !!me?.answered || sentFor === s.current_index;
  const timeUp = left === 0;

  const submit = async (sel: string[], txt: string | null) => {
    if (pending) return;
    const index = s.current_index;
    setPending(true);
    setSentFor(index); // show "Jawaban terkirim" immediately
    navigator.vibrate?.(30);
    const { error } = await supabase.rpc("live_answer", { p_session: s.id, p_selected: sel, p_text: txt });
    setPending(false);
    if (error && !/sudah menjawab/i.test(error.message)) {
      setSentFor(null);
      toast.error(dbErrorMessage(error));
      refresh();
      return;
    }
    ping(); // host's answer counter updates instantly
    refresh();
  };

  return (
    <LiveShell className="flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-sm font-semibold text-white/80">{state.quiz.title}</p>
        <div className="flex items-center gap-2">
          {me?.rank ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs">#{me.rank}</span> : null}
          <span className="rounded-full bg-amber-400 px-3 py-1 font-mono text-sm font-bold text-slate-900">{me?.score ?? 0}</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-6">
        {s.status === "lobby" && (
          <Center>
            <Loader2 className="h-10 w-10 animate-spin text-white/70" />
            <h1 className="mt-4 text-2xl font-extrabold">Kamu sudah masuk!</h1>
            <p className="mt-1 text-white/70">Tunggu guru memulai. Lihat namamu di layar kelas.</p>
          </Center>
        )}

        {s.status === "question" && q && (
          answered ? (
            <Center>
              <Check className="h-14 w-14 rounded-full bg-emerald-500 p-3" />
              <h1 className="mt-4 text-2xl font-extrabold">Jawaban terkirim</h1>
              <p className="mt-1 text-white/70">Tunggu sampai waktu habis…</p>
            </Center>
          ) : timeUp ? (
            <Center><h1 className="text-2xl font-extrabold">Waktu habis ⏰</h1></Center>
          ) : (
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 rounded-2xl bg-white p-4 text-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-400">Soal {s.current_index + 1}/{s.total}</p>
                    <ReadAloudButton key={`q-${q.id}`} text={liveSpeechText(q)} lang={speechLang} />
                  </div>
                  <MathText text={q.prompt} className="mt-1 whitespace-pre-wrap text-lg font-bold" />
                  {q.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.image_url} alt="" className="mx-auto mt-3 max-h-48 rounded-xl object-contain" />
                  )}
                </div>
                {left !== null && <TimerRing left={left} total={s.question_seconds} size={64} />}
              </div>

              {TEXT_TYPES.has(q.type) ? (
                <form className="mt-auto space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit([], text.trim()); }}>
                  <input value={text} onChange={(e) => setText(e.target.value)} maxLength={q.type === "word_cloud" ? 40 : 200} autoFocus
                    placeholder={q.type === "word_cloud" ? "Ketik satu kata…" : "Ketik jawabanmu…"}
                    className="h-14 w-full rounded-2xl border-0 bg-white px-4 text-lg font-semibold text-slate-900 outline-none ring-4 ring-transparent focus:ring-amber-400" />
                  <button disabled={pending || !text.trim()} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-lg font-bold disabled:opacity-50">
                    {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />} Kirim
                  </button>
                </form>
              ) : (
                <>
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    {q.options.map((o, i) => {
                      const st = OPTION_STYLES[i % OPTION_STYLES.length];
                      const on = picked.includes(o.id);
                      return (
                        <button key={o.id} disabled={pending}
                          onClick={() => q.type === "multiple_select" ? setPicked((p) => on ? p.filter((x) => x !== o.id) : [...p, o.id]) : submit([o.id], null)}
                          className={cn("flex min-h-20 items-center gap-3 rounded-2xl p-4 text-left text-lg font-bold shadow-lg transition active:scale-95", st.bg, st.hover,
                            on && "ring-4 ring-white")}>
                          <span className="text-2xl">{st.shape}</span><MathText text={o.label} className="flex-1" />
                          {on && <Check className="h-6 w-6" />}
                        </button>
                      );
                    })}
                  </div>
                  {q.type === "multiple_select" && (
                    <button disabled={pending || !picked.length} onClick={() => submit(picked, null)}
                      className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-indigo-900 disabled:opacity-50">
                      <Send className="h-5 w-5" /> Kirim {picked.length} pilihan
                    </button>
                  )}
                </>
              )}
            </div>
          )
        )}

        {s.status === "reveal" && q && (
          <Center>
            {q.type === "poll" || q.type === "word_cloud" ? (
              <><Check className="h-16 w-16 rounded-full bg-sky-500 p-3" /><h1 className="mt-4 text-2xl font-extrabold">Terima kasih atas pendapatmu!</h1></>
            ) : me?.last?.is_correct ? (
              <><Check className="h-16 w-16 rounded-full bg-emerald-500 p-3" /><h1 className="mt-4 text-3xl font-extrabold">Benar!</h1><p className="mt-1 text-xl font-bold text-amber-300">+{me.last.points}</p></>
            ) : (
              <><X className="h-16 w-16 rounded-full bg-rose-500 p-3" /><h1 className="mt-4 text-3xl font-extrabold">{me?.last ? "Belum tepat" : "Tidak menjawab"}</h1>
                {q.accepted_answers?.length ? <p className="mt-2 text-white/80">Jawaban: <b>{q.accepted_answers.join(" / ")}</b></p> : null}
                {q.options.some((o) => o.is_correct) ? <p className="mt-2 text-white/80">Jawaban: <b>{q.options.filter((o) => o.is_correct).map((o) => o.label).join(", ")}</b></p> : null}</>
            )}
            {me?.rank ? <p className="mt-6 rounded-full bg-white/10 px-4 py-2">Peringkatmu sekarang: <b>#{me.rank}</b></p> : null}
            {q.explanation && <div className="mt-6 max-w-lg rounded-2xl bg-white/10 p-4 text-left text-sm"><MathText text={q.explanation} className="whitespace-pre-wrap" /></div>}
            {liveRevealText(q, speechLang) && <div className="mt-4"><ReadAloudButton key={`r-${q.id}`} text={liveRevealText(q, speechLang)} lang={speechLang} /></div>}
          </Center>
        )}

        {s.status === "ended" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
            <h1 className="text-3xl font-black">🏆 Selesai!</h1>
            {me?.rank ? <p className="text-lg">Kamu peringkat <b>#{me.rank}</b> dengan skor <b>{me.score}</b></p> : null}
            <Podium rows={state.leaderboard} />
            <div className="w-full max-w-md"><Leaderboard rows={state.leaderboard} compact /></div>
            <Link href="/student" className="rounded-2xl bg-white/15 px-6 py-3 font-bold hover:bg-white/25">Ke beranda</Link>
          </div>
        )}
      </main>
    </LiveShell>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center text-center">{children}</div>;
}
