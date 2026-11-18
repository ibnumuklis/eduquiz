"use client";
import { useCallback, useEffect, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "id-ID") ?? voices.find((v) => v.lang.toLowerCase().startsWith("id")) ?? null;
}

/** Reads text aloud with the browser's built-in Indonesian voice (free, offline on most devices). */
export function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  const stop = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);
  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/_{2,}/g, " titik-titik "));
    u.lang = "id-ID";
    u.rate = 0.95;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);
  return { speak, stop, speaking, supported };
}

export function ReadAloudButton({ text, prominent = false, autoKey }: { text: string; prominent?: boolean; autoKey?: string }) {
  const { speak, stop, speaking, supported } = useReadAloud();
  useEffect(() => {
    if (prominent && autoKey && supported) speak(text);
  }, [prominent, autoKey, supported, speak, text]);
  if (!supported) return null;
  return (
    <button type="button" onClick={() => (speaking ? stop() : speak(text))} aria-pressed={speaking}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
        prominent ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
      {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {speaking ? "Berhenti" : "Bacakan"}
    </button>
  );
}
