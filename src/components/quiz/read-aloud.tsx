"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Square, Volume2 } from "lucide-react";
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

  const stop = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);
  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const p = prefRef.current;
    const segs = planSpeech(text, defaultTag, { mode: p.mode, idNames: p.idNames, dict: p.dict });
    if (!segs.length) return;
    segs.forEach((seg, i) => {
      const u = new SpeechSynthesisUtterance(seg.text);
      const v = pick(seg.tag);
      u.lang = v?.lang ?? seg.tag;
      if (v) u.voice = v;
      u.rate = prefRef.current.rate;
      u.pitch = 1;
      if (i === segs.length - 1) { u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false); }
      window.speechSynthesis.speak(u);
    });
    setSpeaking(true);
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
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (prominent && autoKey && supported && voices.length) speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prominent, autoKey, supported, voices.length]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const langs = useMemo(() => {
    const tags = [lang];
    if (!lang.startsWith("en")) tags.push("en-US");
    if (!lang.startsWith("id")) tags.push("id-ID");
    return tags;
  }, [lang]);
  if (!supported) return null;
  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      <button type="button" onClick={() => (speaking ? stop() : speak(text))} aria-pressed={speaking} title="Bacakan soal dengan suara"
        className={cn("inline-flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-2 text-xs font-semibold transition",
          prominent ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
        {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {speaking ? "Berhenti" : "Bacakan"}
      </button>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Pengaturan suara" title="Pilih suara & kecepatan"
        className={cn("rounded-r-full py-1.5 pl-1.5 pr-2.5 transition", prominent ? "bg-violet-700 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300")}>
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bahasa pembacaan</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {MODES.map((m) => (
              <button key={m.value} type="button" title={m.hint} onClick={() => update({ ...pref, mode: m.value })}
                className={cn("rounded-lg py-1.5 text-xs font-semibold transition", pref.mode === m.value ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
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
                className={cn("flex-1 rounded-lg py-1.5 text-xs font-semibold", pref.rate === r ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}>{r}×</button>
            ))}
          </div>
          {langs.map((tag) => {
            const list = voicesFor(voices, tag);
            const base = tag.split("-")[0];
            return (
              <div key={tag} className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Suara {base === "en" ? "bahasa Inggris" : base === "id" ? "bahasa Indonesia" : tag}</p>
                {list.length ? (
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={pick(tag)?.voiceURI ?? ""}
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
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs" />
              <p className="text-[11px] italic leading-snug text-slate-400">Kata saja → dibaca suara Indonesia. “kata = bacaan” → diganti cara bacanya.</p>
            </div>
          )}
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Coba kalimat</p>
          <textarea rows={2} value={sample} onChange={(e) => setSample(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
          <div className="mt-1 flex items-center justify-between">
            <button type="button" onClick={() => speak(sample)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Volume2 className="h-3.5 w-3.5" /> Coba suara</button>
            <button type="button" onClick={() => { update(DEFAULT_PREF); setSample(SAMPLE); }} className="text-[11px] text-slate-400 hover:text-slate-600">Atur ulang</button>
          </div>
          <p className="mt-3 text-[11px] italic leading-snug text-slate-400">★ = suara alami. Suara terbaik gratis di Microsoft Edge (“Natural”), Chrome (“Google”), dan iPhone (Siri). Pengaturan disimpan di perangkat ini.</p>
        </div>
      )}
    </div>
  );
}
