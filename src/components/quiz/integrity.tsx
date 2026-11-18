"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, ShieldAlert, Siren } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import type { IntegrityKind } from "@/types";

interface Options {
  supabase: SupabaseClient | null;
  attemptId: string;
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  blockClipboard: boolean;
  initialCount: number;
  active: boolean;
  alarm?: boolean;
}

const LABEL: Record<IntegrityKind, string> = {
  tab_hidden: "meninggalkan tab kuis",
  window_blur: "berpindah ke jendela lain",
  fullscreen_exit: "keluar dari layar penuh",
  copy: "menyalin teks",
  paste: "menempel teks",
  context_menu: "membuka menu klik kanan",
  shortcut: "menekan tombol pintasan terlarang",
  split_screen: "membagi layar / mengecilkan jendela",
};

// ---------- Alarm (Web Audio, no files) ----------
let audioCtx: AudioContext | null = null;
function ensureAudio() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => undefined);
  return audioCtx;
}
/** Two-tone siren (~2 s). Browsers only allow sound after the student has interacted with the page once. */
export function playAlarm(seconds = 2) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  const t0 = ctx.currentTime;
  for (let i = 0; i < seconds * 4; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 990, t0 + i * 0.25);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
  gain.gain.setValueAtTime(0.22, t0 + seconds - 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.05);
  if ("vibrate" in navigator) navigator.vibrate?.([300, 120, 300, 120, 300]);
}

/**
 * Records focus/fullscreen/clipboard signals for the teacher. These are signals, never automatic
 * penalties — the student is told every time something is recorded.
 */
export function useIntegrity({ supabase, attemptId, requireFullscreen, detectTabSwitch, blockClipboard, initialCount, active, alarm = true }: Options) {
  const [count, setCount] = useState(initialCount);
  const [needFullscreen, setNeedFullscreen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const lastHidden = useRef(0);
  const lastSent = useRef<Record<string, number>>({});
  const pendingAlarm = useRef(false);

  // Unlock audio on the first interaction (browser autoplay rules).
  useEffect(() => {
    if (!active || !alarm) return;
    const unlock = () => ensureAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [active, alarm]);

  const raise = useCallback((kind: IntegrityKind) => {
    if (!alarm) return;
    setWarning(LABEL[kind]);
    if (document.visibilityState === "hidden") pendingAlarm.current = true; // replay when the student comes back
    playAlarm();
  }, [alarm]);

  const log = useCallback(async (kind: IntegrityKind) => {
    if (!supabase || !active) return;
    const now = Date.now();
    if (now - (lastSent.current[kind] ?? 0) < 2000) return; // de-duplicate bursts
    lastSent.current[kind] = now;
    const { data } = await supabase.rpc("log_integrity_event", { p_attempt: attemptId, p_kind: kind });
    const c = (data as { count?: number } | null)?.count;
    if (typeof c === "number") setCount(c);
    raise(kind);
    toast.warning(`Tercatat: ${LABEL[kind]}. Guru dapat melihat catatan ini.`, { id: "integrity" });
  }, [supabase, attemptId, active, raise]);

  // Fullscreen gate
  useEffect(() => {
    if (!active || !requireFullscreen) return;
    const supported = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
    if (!supported) return; // e.g. iPhone Safari: cannot enforce
    const sync = () => {
      const inFs = !!document.fullscreenElement;
      setNeedFullscreen(!inFs);
      if (!inFs && sessionStorage.getItem(`eq-fs-${attemptId}`)) log("fullscreen_exit");
      if (inFs) sessionStorage.setItem(`eq-fs-${attemptId}`, "1");
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedFullscreen(!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [active, requireFullscreen, attemptId, log]);

  // Tab / window focus
  useEffect(() => {
    if (!active || !detectTabSwitch) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") { lastHidden.current = Date.now(); log("tab_hidden"); }
      else if (pendingAlarm.current && alarm) { pendingAlarm.current = false; playAlarm(); }
    };
    const onBlur = () => {
      setTimeout(() => {
        if (document.visibilityState === "visible" && Date.now() - lastHidden.current > 1500 && !document.hasFocus()) log("window_blur");
      }, 800);
    };
    // Split screen / floating window: the window becomes much smaller than the screen.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const baseW = window.innerWidth, baseH = window.innerHeight;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (document.fullscreenElement) return;
        // On touch devices the on-screen keyboard shrinks the height, so only width counts there.
        const touch = window.matchMedia("(pointer: coarse)").matches;
        const shrunk = window.innerWidth < baseW * 0.7 || (!touch && window.innerHeight < baseH * 0.6);
        const tooSmall = window.innerWidth < (window.screen.availWidth || baseW) * 0.55;
        if (shrunk || tooSmall) log("split_screen");
      }, 700);
    };
    // Shortcuts commonly used to cheat: screenshots, dev tools, view-source, print, save, find.
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const bad = k === "printscreen" || k === "f12"
        || (ctrl && e.shiftKey && ["i", "j", "c", "s"].includes(k))
        || (ctrl && ["u", "p", "s"].includes(k))
        || (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(k));
      if (bad) { e.preventDefault(); log("shortcut"); }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey, true);
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "PrintScreen") log("shortcut"); };
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      clearTimeout(resizeTimer);
    };
  }, [active, detectTabSwitch, log, alarm]);

  // Clipboard & context menu (exam mode)
  useEffect(() => {
    if (!active || !blockClipboard) return;
    const stop = (kind: IntegrityKind) => (e: Event) => { e.preventDefault(); log(kind); };
    const onCopy = stop("copy"), onPaste = stop("paste"), onMenu = stop("context_menu");
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onMenu);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onMenu);
    };
  }, [active, blockClipboard, log]);

  const enterFullscreen = useCallback(async () => {
    try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch { toast.error("Browser menolak layar penuh. Izinkan lalu coba lagi."); }
  }, []);

  const dismissWarning = useCallback(() => setWarning(null), []);
  return { count, needFullscreen, enterFullscreen, warning, dismissWarning };
}

/** Full-screen red warning that accompanies the alarm. */
export function IntegrityWarning({ reason, count, onClose }: { reason: string; count: number; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [reason, count, onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-rose-600/90 p-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="iw-title">
      <div className="max-w-md animate-celebrate rounded-3xl bg-white p-8 text-center shadow-2xl">
        <span className="mx-auto grid h-16 w-16 animate-pulse place-items-center rounded-2xl bg-rose-100 text-rose-600"><Siren className="h-9 w-9" /></span>
        <h2 id="iw-title" className="mt-4 text-2xl font-extrabold text-rose-700">Peringatan!</h2>
        <p className="mt-2 text-slate-700">Kamu terdeteksi <strong>{reason}</strong>.</p>
        <p className="mt-1 text-sm text-slate-500">Kejadian ini tercatat ({count}×) dan terlihat oleh guru. Tetap di halaman kuis sampai selesai.</p>
        <Button size="lg" className="mt-6 w-full" onClick={onClose}>Saya mengerti, lanjutkan</Button>
      </div>
    </div>
  );
}

export function FullscreenGate({ onEnter, returning }: { onEnter: () => void; returning: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/80 p-6 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="fs-title">
      <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Maximize className="h-7 w-7" /></span>
        <h2 id="fs-title" className="mt-4 text-xl font-bold text-slate-900">{returning ? "Kembali ke layar penuh" : "Kuis ini memakai layar penuh"}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {returning ? "Kamu keluar dari layar penuh dan hal ini tercatat. Waktu tetap berjalan." : "Gurumu mengaktifkan mode layar penuh. Keluar dari layar penuh atau berpindah aplikasi akan tercatat."}
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={onEnter}><Maximize className="h-5 w-5" /> Masuk layar penuh</Button>
      </div>
    </div>
  );
}

export function IntegrityBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800" title="Jumlah kejadian yang tercatat untuk guru">
      <ShieldAlert className="h-3.5 w-3.5" /> {count}
    </span>
  );
}

/** Light, repeated watermark with the student's identity to discourage photographing questions. */
export function Watermark({ text }: { text: string }) {
  const items = Array.from({ length: 24 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 select-none overflow-hidden print:hidden">
      <div className="absolute -inset-1/2 grid rotate-[-24deg] grid-cols-3 gap-x-24 gap-y-28 opacity-[0.07]">
        {items.map((_, i) => <span key={i} className="whitespace-nowrap text-lg font-bold text-slate-900">{text}</span>)}
      </div>
    </div>
  );
}
