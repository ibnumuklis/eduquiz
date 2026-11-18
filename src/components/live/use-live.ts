"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchLiveState, type LiveState } from "@/features/live/actions";

/** Ambil state Live dan segarkan otomatis lewat Realtime (dengan debounce) + polling cadangan. */
export function useLiveState(sessionId: string, initial: LiveState) {
  const [state, setState] = useState<LiveState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offset = useRef(0);

  const refresh = useCallback(async () => {
    const r = await fetchLiveState(sessionId);
    if (r.ok && r.data) {
      offset.current = Date.parse(r.data.session.server_now) - Date.now();
      setState(r.data);
      setError(null);
    } else if (!r.ok) setError(r.error);
  }, [sessionId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 250);
  }, [refresh]);

  useEffect(() => {
    offset.current = Date.parse(initial.session.server_now) - Date.now();
  }, [initial.session.server_now]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_players", filter: `session_id=eq.${sessionId}` }, schedule)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_answers", filter: `session_id=eq.${sessionId}` }, schedule)
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));
    // Cadangan bila Realtime terputus (mis. jaringan sekolah memblokir websocket).
    const poll = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, connected ? 15000 : 4000);
    return () => {
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [sessionId, schedule, refresh, connected]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { state, refresh, error, connected, serverNow };
}

/** Sisa detik soal saat ini, berdasarkan jam server. */
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
    const t = setInterval(tick, 250);
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
