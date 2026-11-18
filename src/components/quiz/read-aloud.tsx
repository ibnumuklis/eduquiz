"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PREF_KEY = "eq-tts-pref";
interface Pref { rate: number; voices: Record<string, string> }
function loadPref(): Pref {
  try { return { rate: 1, voices: {}, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") }; } catch { return { rate: 1, voices: {} }; }
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

const EN = new Set("the a an is are was were be been of to and or in on at for with what which who whom whose when where why how this that these those it its you your he she they we i my our their his her do does did not can could should would will shall may might must have has had there here from by as if then than so but because about into after before".split(" "));
const ID = new Set("yang dan di ke dari ini itu adalah untuk dengan tidak akan pada dalam apa siapa bagaimana mengapa kapan dimana manakah berikut sebagai atau juga karena oleh telah sudah belum bisa dapat harus kami kita mereka saya kamu anda nya lebih paling sangat".split(" "));

/** Splits text into sentences and tags each one as English or the quiz language (simple stop-word vote). */
export function segmentByLanguage(text: string, defaultTag: string) {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?\n]+[.!?]*|\n/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean).map((p) => {
    if (!defaultTag.startsWith("id")) return { text: p, tag: defaultTag };
    const words = p.toLowerCase().match(/[a-z']+/g) ?? [];
    const en = words.filter((w) => EN.has(w)).length;
    const id = words.filter((w) => ID.has(w)).length;
    return { text: p, tag: en >= 2 && en > id ? "en-US" : defaultTag };
  });
}

/** Reads text aloud with the device's best voice for each language (free, built into the browser). */
export function useReadAloud(defaultTag = "id-ID") {
  const voices = useVoices();
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pref, setPref] = useState<Pref>({ rate: 1, voices: {} });
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
    const clean = text.replace(/_{2,}/g, defaultTag.startsWith("en") ? " blank " : " titik-titik ").replace(/\$+/g, "");
    const segs = segmentByLanguage(clean, defaultTag);
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

export function ReadAloudButton({ text, prominent = false, autoKey, lang = "id-ID" }: { text: string; prominent?: boolean; autoKey?: string; lang?: string }) {
  const { speak, stop, speaking, supported, voices, pref, update, pick } = useReadAloud(lang);
  const [open, setOpen] = useState(false);
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
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kecepatan</p>
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
          <p className="mt-3 text-[11px] leading-snug text-slate-500">★ = suara alami. Suara terbaik tersedia gratis di Microsoft Edge (“Natural”), Chrome (“Google”), dan iPhone (Siri). Kalimat bahasa Inggris dalam soal dibacakan otomatis dengan aksen Inggris.</p>
          <button type="button" onClick={() => speak("Halo, ini contoh suara. Hello, this is how English sounds.")} className="mt-2 text-xs font-semibold text-brand-700 hover:underline">Coba suara</button>
        </div>
      )}
    </div>
  );
}
