"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, ShieldAlert } from "lucide-react";
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
}

const LABEL: Record<IntegrityKind, string> = {
  tab_hidden: "meninggalkan tab kuis",
  window_blur: "berpindah ke jendela lain",
  fullscreen_exit: "keluar dari layar penuh",
  copy: "menyalin teks",
  paste: "menempel teks",
  context_menu: "membuka menu klik kanan",
};

/**
 * Records focus/fullscreen/clipboard signals for the teacher. These are signals, never automatic
 * penalties — the student is told every time something is recorded.
 */
export function useIntegrity({ supabase, attemptId, requireFullscreen, detectTabSwitch, blockClipboard, initialCount, active }: Options) {
  const [count, setCount] = useState(initialCount);
  const [needFullscreen, setNeedFullscreen] = useState(false);
  const lastHidden = useRef(0);
  const lastSent = useRef<Record<string, number>>({});

  const log = useCallback(async (kind: IntegrityKind) => {
    if (!supabase || !active) return;
    const now = Date.now();
    if (now - (lastSent.current[kind] ?? 0) < 2000) return; // de-duplicate bursts
    lastSent.current[kind] = now;
    const { data } = await supabase.rpc("log_integrity_event", { p_attempt: attemptId, p_kind: kind });
    const c = (data as { count?: number } | null)?.count;
    if (typeof c === "number") setCount(c);
    toast.warning(`Tercatat: ${LABEL[kind]}. Guru dapat melihat catatan ini.`, { id: "integrity" });
  }, [supabase, attemptId, active]);

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
    };
    const onBlur = () => {
      setTimeout(() => {
        if (document.visibilityState === "visible" && Date.now() - lastHidden.current > 1500 && !document.hasFocus()) log("window_blur");
      }, 800);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur); };
  }, [active, detectTabSwitch, log]);

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

  return { count, needFullscreen, enterFullscreen };
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
