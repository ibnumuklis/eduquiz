"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveState } from "@/features/live/actions";

const signed = new Map<string, string>();

/**
 * Live session state, kept fresh three ways (fastest first):
 *  1. Broadcast "sync" pings — host and players ping each other right after every action (~50–150 ms).
 *  2. Postgres changes on the live tables (backup signal).
 *  3. Light polling, faster while a question is running.
 * All reads/writes go straight from the browser to Supabase RPCs (no extra server hop).
 */
export function useLive(sessionId: string, initial: LiveState) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<LiveState>(initial);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);
  const inflight = useRef(false);
  const again = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => { offset.current = Date.parse(initial.session.server_now) - Date.now(); }, [initial.session.server_now]);

  const refresh = useCallback(async () => {
    if (inflight.current) { again.current = true; return; }
    inflight.current = true;
    try {
      do {
        again.current = false;
        const t0 = Date.now();
        const { data, error: err } = await supabase.rpc("live_state", { p_session: sessionId });
        if (err) { setError(err.message); continue; }
        const next = data as LiveState;
        // Server clock offset, corrected for half the round-trip.
        offset.current = Date.parse(next.session.server_now) - (t0 + Date.now()) / 2;
        const path = next.question?.image_path;
        if (path && next.question) {
          if (!signed.has(path)) {
            const { data: s } = await supabase.storage.from("quiz-media").createSignedUrl(path, 3600);
            if (s?.signedUrl) signed.set(path, s.signedUrl);
          }
          next.question.image_url = signed.get(path) ?? null;
        }
        setError(null);
        setState(next);
      } while (again.current);
    } finally {
      inflight.current = false;
    }
  }, [supabase, sessionId]);

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    const kick = () => refreshRef.current();
    const channel = supabase
      .channel(`live:${sessionId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "sync" }, kick)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, kick)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_players", filter: `session_id=eq.${sessionId}` }, kick)
      .subscribe((status: string) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") kick(); // catch anything missed while connecting
      });
    channelRef.current = channel;
    const onVisible = () => { if (document.visibilityState === "visible") kick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", kick);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", kick);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  // Safety-net polling: quick while a question runs or the socket is down, slow otherwise.
  const status = state.session.status;
  useEffect(() => {
    if (status === "ended") return;
    const ms = !connected ? 2000 : status === "question" ? (initial.is_host ? 1500 : 3000) : 5000;
    const t = setInterval(() => { if (document.visibilityState === "visible") refreshRef.current(); }, ms);
    return () => clearInterval(t);
  }, [status, connected, initial.is_host]);

  /** Tell everyone in the room to refresh now. */
  const ping = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "sync", payload: {} }).catch(() => {});
  }, []);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { supabase, state, setState, refresh, ping, connected, error, serverNow };
}

/** Remaining seconds of the running question, based on the server clock. */
export function useCountdown(state: LiveState, serverNow: () => number) {
  const calc = useCallback(() => {
    const s = state.session;
    if (s.status !== "question" || !s.question_started_at) return null;
    const end = Date.parse(s.question_started_at) + s.question_seconds * 1000;
    return Math.max(0, Math.ceil((end - serverNow()) / 1000));
  }, [state, serverNow]);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(calc());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 200);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [calc]);
  return left;
}

export const OPTION_STYLES = [
  { bg: "bg-rose-500", hover: "hover:bg-rose-600", shape: "▲" },
  { bg: "bg-sky-500", hover: "hover:bg-sky-600", shape: "◆" },
  { bg: "bg-amber-500", hover: "hover:bg-amber-600", shape: "●" },
  { bg: "bg-emerald-500", hover: "hover:bg-emerald-600", shape: "■" },
  { bg: "bg-violet-500", hover: "hover:bg-violet-600", shape: "★" },
  { bg: "bg-teal-500", hover: "hover:bg-teal-600", shape: "⬟" },
];

export const TEXT_TYPES = new Set(["short_answer", "fill_blank", "word_cloud"]);

/** Text read aloud for a Live question: the prompt followed by its answer choices. */
export function liveSpeechText(q: NonNullable<LiveState["question"]>, withOptions = true) {
  const opts = withOptions && !TEXT_TYPES.has(q.type) && q.options.length
    ? ` ${q.options.map((o, i) => `${String.fromCharCode(65 + i)}: ${o.label}`).join(". ")}.`
    : "";
  return `${q.prompt}${/[.!?]$/.test(q.prompt.trim()) ? "" : "."}${opts}`;
}

/** Text read after the answer is revealed: the correct answer and explanation. */
export function liveRevealText(q: NonNullable<LiveState["question"]>, lang: string) {
  const en = lang.startsWith("en");
  const correct = q.type === "poll" || q.type === "word_cloud" ? []
    : q.options.filter((o) => o.is_correct).map((o) => o.label).concat(q.accepted_answers ?? []);
  const head = correct.length ? `${en ? "The answer is" : "Jawaban yang benar:"} ${correct.join(", ")}.` : "";
  return [head, q.explanation ?? ""].filter(Boolean).join(" ");
}
