"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones } from "lucide-react";

/** Audio for listening questions, with an optional play limit (counted on this device). */
export function QuestionAudio({ src, maxPlays = 0, storageKey }: { src: string; maxPlays?: number; storageKey?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [plays, setPlays] = useState(0);
  useEffect(() => {
    if (!storageKey) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlays(Number(localStorage.getItem(storageKey) ?? 0));
    } catch { /* ignore */ }
  }, [storageKey]);
  const exhausted = maxPlays > 0 && plays >= maxPlays;

  const onPlay = () => {
    const a = ref.current;
    if (!a) return;
    if (exhausted) { a.pause(); return; }
    if (a.currentTime < 0.5) {
      const next = plays + 1;
      setPlays(next);
      try { if (storageKey) localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-800">
        <Headphones className="h-4 w-4" /> Dengarkan audio
        {maxPlays > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-sky-700">Diputar {Math.min(plays, maxPlays)}/{maxPlays}×</span>}
      </p>
      {exhausted ? (
        <p className="text-sm text-slate-600">Batas putar audio sudah habis. Jawab berdasarkan yang sudah kamu dengar.</p>
      ) : (
        <audio ref={ref} src={src} controls controlsList="nodownload noplaybackrate" preload="metadata" onPlay={onPlay} className="w-full" />
      )}
    </div>
  );
}
