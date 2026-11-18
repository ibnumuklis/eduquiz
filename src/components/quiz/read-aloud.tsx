"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, Square, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { planSpeech, type SpeechMode } from "@/lib/tts/plan";

const PREF_KEY = "eq-tts-pref";
interface Pref { rate: number; voices: Record<string, string>; mode: SpeechMode; idNames: boolean; dict: string }
const DEFAULT_PREF: Pref = { rate: 1, voices: {}, mode: "auto", idNames: true, dict: "" };
function loadPref(): Pref {
  try { return { ...DEFAULT_PREF, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") }; } catch { return DEFAULT_PREF; }
}
function savePref(p: Pref) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

/** Higher score = more natural sounding. Edge "Natural"/"Online", Google and Apple premium voices first. */
function voiceScore(v: SpeechSynthesisVoice, tag: string) {
  let s = 0;
  if (v.lang.toLowerCase() === tag.toLowerCase()) s += 20;
  if (/natural|neural|online/i.test(v.name)) s += 100;
  if (/google/i.test(v.name)) s += 60;
  if (/premium|enhanced|siri/i.test(v.name)) s += 50;
  if (!v.localService) s += 5;
  return s;
}

export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

export function voicesFor(voices: SpeechSynthesisVoice[], tag: string) {
  const base = tag.split("-")[0].toLowerCase();
  return voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base)).sort((a, b) => voiceScore(b, tag) - voiceScore(a, tag));
}

/** Sentence-level language split (kept for compatibility; see planSpeech for the full planner). */
export function segmentByLanguage(text: string, defaultTag: string) {
  return planSpeech(text, defaultTag, { idNames: false });
}

/** Reads text aloud with the device's best voice for each language (free, built into the browser). */
export function useReadAloud(defaultTag = "id-ID") {
  const voices = useVoices();
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pref, setPref] = useState<Pref>(DEFAULT_PREF);
  const prefRef = useRef(pref);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    const p = loadPref();
    setPref(p);
    prefRef.current = p;
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);

  const pick = useCallback((tag: string) => {
    const base = tag.split("-")[0];
    const chosen = prefRef.current.voices[base];
    const list = voicesFor(voices, tag);
    return list.find((v) => v.voiceURI === chosen) ?? list[0] ?? null;
  }, [voices]);

  // Each speak() gets a token; a newer speak() or stop() invalidates older queues.
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    run.current++;
    clearTimeout(timer.current);
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  useEffect(() => () => { run.current++; clearTimeout(timer.current); }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    clearTimeout(timer.current);
    const p = prefRef.current;
    const parts = planSpeech(text, defaultTag, { mode: p.mode, idNames: p.idNames, dict: p.dict });
    if (!parts.length) return;
    const token = ++run.current;
    setSpeaking(true);
    // Speak parts one after another so pause markers become real silences.
    const next = (i: number) => {
      if (run.current !== token) return;
      if (i >= parts.length) { setSpeaking(false); return; }
      const part = parts[i];
      if (part.pause) { timer.current = setTimeout(() => next(i + 1), part.pause); return; }
      const u = new SpeechSynthesisUtterance(part.text);
      const v = pick(part.tag);
      u.lang = v?.lang ?? part.tag;
      if (v) u.voice = v;
      u.rate = prefRef.current.rate;
      u.pitch = 1;
      u.onend = () => next(i + 1);
      u.onerror = () => next(i + 1);
      window.speechSynthesis.speak(u);
    };
    next(0);
  }, [defaultTag, pick]);

  const update = useCallback((p: Pref) => { prefRef.current = p; setPref(p); savePref(p); }, []);
  return { speak, stop, speaking, supported, voices, pref, update, pick };
}

const RATES = [0.75, 0.9, 1, 1.15, 1.3];
const MODES: { value: SpeechMode; label: string; hint: string }[] = [
  { value: "auto", label: "Otomatis", hint: "Kalimat Inggris dibaca suara Inggris, sisanya suara Indonesia" },
  { value: "id", label: "Indonesia", hint: "Semua teks dibaca dengan suara bahasa Indonesia" },
  { value: "en", label: "Inggris", hint: "Semua teks dibaca dengan suara bahasa Inggris" },
];
const SAMPLE = "Budi goes to SMA Negeri 1 Makassar at 07.30 every day. Upacara dimulai pukul 07.00 WITA.";

export function ReadAloudButton({ text, prominent = false, autoKey, lang = "id-ID" }: { text: string; prominent?: boolean; autoKey?: string; lang?: string }) {
  const { speak, stop, speaking, supported, voices, pref, update, pick } = useReadAloud(lang);
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState(SAMPLE);
  const [showDict, setShowDict] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  /** null = closed; "sheet" = phone bottom sheet; otherwise a fixed, on-screen popover position. */
  const [layout, setLayout] = useState<null | { sheet: true } | { sheet: false; top: number; left: number; maxH: number }>(null);
  const openSettings = () => {
    if (open) { setOpen(false); return; }
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 640) setLayout({ sheet: true });
    else {
      const r = btnRef.current?.getBoundingClientRect();
      const width = 320, gap = 8;
      const left = Math.min(Math.max(gap, (r?.right ?? vw) - width), vw - width - gap);
      const below = (r?.bottom ?? 0) + gap;
      const spaceBelow = vh - below - gap;
      const top = spaceBelow >= 320 ? below : Math.max(gap, (r?.top ?? vh) - gap - Math.min(560, vh - 2 * gap));
      setLayout({ sheet: false, top, left, maxH: spaceBelow >= 320 ? spaceBelow : Math.min(560, vh - 2 * gap) });
    }
    setOpen(true);
  };
  useEffect(() => {
    if (prominent && autoKey && supported && voices.length) speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prominent, autoKey, supported, voices.length]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onResize = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    // Phone bottom sheet: keep the page behind it from scrolling.
    const prev = document.body.style.overflow;
    if (layout?.sheet) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prev;
    };
  }, [open, layout]);
  const langs = useMemo(() => {
    const tags = [lang];
    if (!lang.startsWith("en")) tags.push("en-US");
    if (!lang.startsWith("id")) tags.push("id-ID");
    return tags;
  }, [lang]);
  if (!supported) return null;
  return (
    <div className="relative inline-flex items-center">
      <button type="button" onClick={() => (speaking ? stop() : speak(text))} aria-pressed={speaking} title="Bacakan soal dengan suara"
        className={cn("inline-flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-2 text-xs font-semibold transition",
          prominent ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
        {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {speaking ? "Berhenti" : "Bacakan"}
      </button>
      <button ref={btnRef} type="button" onClick={openSettings} aria-expanded={open} aria-haspopup="dialog" aria-label="Pengaturan suara" title="Pilih suara & kecepatan"
        className={cn("rounded-r-full py-1.5 pl-1.5 pr-2.5 transition", prominent ? "bg-violet-700 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}>
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {open && layout && typeof document !== "undefined" && createPortal(
        <>
          <div className={cn("fixed inset-0 z-[90]", layout.sheet ? "animate-fade-in bg-slate-900/40 backdrop-blur-[1px]" : "")}
            onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Pengaturan suara"
            style={layout.sheet ? undefined : { top: layout.top, left: layout.left, maxHeight: layout.maxH }}
            className={cn("fixed z-[91] overflow-y-auto overscroll-contain bg-white text-left text-slate-700 shadow-2xl",
              layout.sheet
                ? "inset-x-0 bottom-0 max-h-[85dvh] animate-fade-in rounded-t-3xl px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                : "w-80 animate-fade-in rounded-2xl border border-slate-200 p-4")}>
          {layout.sheet && <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">Pengaturan suara</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bahasa pembacaan</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {MODES.map((m) => (
              <button key={m.value} type="button" title={m.hint} onClick={() => update({ ...pref, mode: m.value })}
                className={cn("rounded-lg py-2 text-xs font-semibold transition sm:py-1.5", pref.mode === m.value ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] italic text-slate-400">{MODES.find((m) => m.value === pref.mode)?.hint}</p>
          {pref.mode !== "id" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5 accent-brand-600" checked={pref.idNames} onChange={(e) => update({ ...pref, idNames: e.target.checked })} />
              <span>Nama orang, sekolah &amp; tempat Indonesia dibaca dengan suara Indonesia <span className="text-slate-400">(mis. Budi, SMA Negeri 1 Makassar)</span></span>
            </label>
          )}
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Kecepatan</p>
          <div className="mt-2 flex gap-1">
            {RATES.map((r) => (
              <button key={r} type="button" onClick={() => update({ ...pref, rate: r })}
                className={cn("flex-1 rounded-lg py-2 text-xs font-semibold sm:py-1.5", pref.rate === r ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}>{r}×</button>
            ))}
          </div>
          {langs.map((tag) => {
            const list = voicesFor(voices, tag);
            const base = tag.split("-")[0];
            return (
              <div key={tag} className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Suara {base === "en" ? "bahasa Inggris" : base === "id" ? "bahasa Indonesia" : tag}</p>
                {list.length ? (
                  <select className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-base sm:py-1.5 sm:text-xs" value={pick(tag)?.voiceURI ?? ""}
                    onChange={(e) => update({ ...pref, voices: { ...pref.voices, [base]: e.target.value } })}>
                    {list.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{/natural|neural|online|google|premium|enhanced/i.test(v.name) ? " ★" : ""}</option>)}
                  </select>
                ) : <p className="mt-1 text-xs text-amber-700">Perangkat ini belum punya suara {base}. Pasang dari pengaturan bahasa perangkat.</p>}
              </div>
            );
          })}
          <button type="button" onClick={() => setShowDict((v) => !v)} className="mt-4 text-xs font-semibold text-slate-600 hover:text-brand-700">
            {showDict ? "▾" : "▸"} Kamus lafal {pref.dict.trim() ? `(${pref.dict.split(/\n/).filter((l) => l.trim()).length})` : "(opsional)"}
          </button>
          {showDict && (
            <div className="mt-1">
              <textarea rows={4} value={pref.dict} onChange={(e) => update({ ...pref, dict: e.target.value })} spellCheck={false}
                placeholder={"Satu kata per baris, contoh:\nTompo\nDaeng = deng\nGowa = go-wa"}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-base sm:text-xs" />
              <p className="text-[11px] italic leading-snug text-slate-400">Kata saja → dibaca suara Indonesia. “kata = bacaan” → diganti cara bacanya.</p>
            </div>
          )}
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Coba kalimat</p>
          <textarea rows={2} value={sample} onChange={(e) => setSample(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-base sm:text-xs" />
          <div className="mt-1 flex items-center justify-between">
            <button type="button" onClick={() => speak(sample)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Volume2 className="h-3.5 w-3.5" /> Coba suara</button>
            <button type="button" onClick={() => { update(DEFAULT_PREF); setSample(SAMPLE); }} className="text-[11px] text-slate-400 hover:text-slate-600">Atur ulang</button>
          </div>
          <p className="mt-3 text-[11px] italic leading-snug text-slate-400">★ = suara alami. Suara terbaik gratis di Microsoft Edge (“Natural”), Chrome (“Google”), dan iPhone (Siri). Pengaturan disimpan di perangkat ini.</p>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
