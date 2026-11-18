/**
 * Speech planning for the free browser voices (Web Speech API).
 * Decides which voice reads which part of a question and rewrites times, numbers,
 * school abbreviations and Indonesian names so each voice pronounces them naturally.
 * Pure functions — unit-tested in tests/unit/tts.test.ts.
 */

export type SpeechMode = "auto" | "id" | "en";
export interface SpeechOptions {
  mode?: SpeechMode;
  /** Read Indonesian names, places and school terms inside English sentences with the Indonesian voice. */
  idNames?: boolean;
  /** User pronunciation dictionary: "kata" (read with Indonesian voice) or "kata = cara baca". */
  dict?: string;
}
export interface SpeechPart { text: string; tag: string; /** Silence in ms (text is empty). */ pause?: number }

/** Inline pause marker understood by planSpeech, e.g. `A${pause(400)}Ibu kota`. */
export const pause = (ms: number) => `[[jeda:${Math.max(0, Math.round(ms))}]]`;
const PAUSE_RE = /\[\[jeda:(\d+)\]\]/;

/**
 * Speech text for answer choices: "A … <jawaban> … B … <jawaban>",
 * with a short pause after each letter and a longer one between choices.
 */
export function optionsSpeech(labels: string[], numbered = false) {
  return labels.map((label, i) => `${numbered ? i + 1 : String.fromCharCode(65 + i)}${pause(450)}${label}${pause(750)}`).join("");
}

const EN_STOP = new Set(("the a an is are was were be been of to and or in on at for with what which who whom whose when where why how this that these those it its you your he she they we i my our their his her do does did not can could should would will shall may might must have has had there here from by as if then than so but because about into after before goes go went every " +
  "me him them us am very some any all one two three many much yes no up out off over under good morning afternoon evening night day time name live lives school class teacher student friend house home " +
  "starts start become became want wants like likes said says say read write look see saw get got make made take took come came give gave know think").split(" "));
const EN_SHAPE = /(th|sh|ph|ck|ee|oo|ea|ou|ow|igh|tion|ing$|ed$|ly$|'s$|'t$)/;
const ID_SHAPE = /^(me[mnr]?|be[rl]?|di|te[r]?|ke|pe[mnr]?|se)[a-z]{3,}(kan|an|nya|i)$|^[a-z]+(kan|nya|lah|kah)$/;
const ID_STOP = new Set("yang dan di ke dari ini itu adalah untuk dengan tidak akan pada dalam apa siapa bagaimana mengapa kapan dimana manakah berikut sebagai atau juga karena oleh telah sudah belum bisa dapat harus kami kita mereka saya kamu anda nya lebih paling sangat".split(" "));

/** Indonesian school, address and honorific terms (matched case-sensitively unless lowercase here). */
const ID_TERMS = new Set([
  "SD", "SDN", "SDIT", "MI", "MIN", "SMP", "SMPN", "SMPIT", "MTs", "MTsN", "SMA", "SMAN", "SMAIT", "SMK", "SMKN", "MA", "MAN", "TK", "PAUD",
  "UIN", "IAIN", "UNM", "UNHAS", "UI", "ITB", "UGM", "OSIS", "UKS", "WIB", "WITA", "WIT", "RT", "RW", "Jl", "Jln", "Kec", "Kab", "Kel", "Prov",
  "Pak", "Bu", "Ibu", "Bapak", "Kak", "Mas", "Mbak", "Bang", "Daeng", "Haji", "Hj", "Ustaz", "Ustadz", "Ustazah",
  "Negeri", "Swasta", "Terpadu", "Jalan", "Kota", "Kabupaten", "Kecamatan", "Kelurahan", "Desa", "Kampung", "Pulau", "Gunung",
  "Sungai", "Danau", "Pantai", "Masjid", "Pasar", "Taman", "Lapangan", "Benteng", "Pondok", "Pesantren",
]);
const ID_PROPER = new Set(("Jakarta Bandung Surabaya Makassar Medan Yogyakarta Jogja Semarang Malang Bali Bogor Depok Bekasi Tangerang Palembang " +
  "Padang Pekanbaru Banjarmasin Pontianak Samarinda Balikpapan Manado Ambon Jayapura Kupang Mataram Denpasar Gowa Maros Takalar Bone Pare Parepare " +
  "Palopo Kendari Palu Gorontalo Sulawesi Sumatra Sumatera Kalimantan Jawa Papua Maluku Lombok Bandar Lampung Aceh Riau Jambi Bengkulu Banten " +
  "Borobudur Prambanan Monas Toraja Bunaken Bromo Losari Somba Opu Rotterdam " +
  "Budi Siti Andi Ahmad Muhammad Muhammad Rina Dewi Sri Wati Agus Joko Bambang Putri Ayu Nur Rizki Rizky Fajar Dimas Rudi Hendra Yusuf Fitri Indah " +
  "Ratna Wahyu Eko Dian Lestari Rahmat Rahman Hasan Ali Fatimah Aisyah Nabila Bayu Arif Ilham Reza Dina Tono Tini Udin Asep Iwan Ani Ibnu Ulfa " +
  "Mukhlis Kartini Sukarno Soekarno Hatta Diponegoro Habibie Hasanuddin Sultan Syahrir Wulan Intan Citra Galih Yogi Adi Ade Ika Eka Dwi Tri " +
  "Kurniawan Setiawan Hidayat Saputra Saputri Pratama Wijaya Santoso Susanti Rahayu Nugroho Firmansyah Hamzah Zainal Amir Anwar Irfan Fikri " +
  "Nurul Ainun Annisa Salsabila Syifa Zahra Khadijah Rafi Raka Dafa Daffa Naufal Alif Farhan Akbar Ridwan Lukman Sinta Santi Yanti Yuni Mega").split(" "));
/** English proper names that would otherwise look Indonesian (simple consonant-vowel shape). */
const EN_PROPER = new Set("America Canada Asia Australia Korea Africa Europe Lisa Maria Mia Nina Tina Rita Mona Dana Sofia Sophia Olivia Julia Linda Anna Emma Ella Luna Lucy Sara Sarah Dora Coca Cola Nokia Toyota Honda Yamaha Kawasaki Sydney Khan Tokyo Osaka Roma Cuba Peru Mexico Vera Diana Tara Kate Mike Jane Jose Rose Rome Pete Joe Bob Tom Sam".split(" "));

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const TZ = "(?:WIB|WITA|WIT)";

function clean(word: string) { return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); }

/** Parses "kata" / "kata = bacaan" lines. */
export function parseDict(dict = "") {
  const read = new Map<string, string>();
  const idWords = new Set<string>();
  for (const raw of dict.split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const [k, ...v] = line.split("=");
    const key = k.trim();
    if (!key) continue;
    if (v.length && v.join("=").trim()) read.set(key.toLowerCase(), v.join("=").trim());
    else idWords.add(key.toLowerCase());
  }
  return { read, idWords };
}

function applyDict(text: string, read: Map<string, string>) {
  if (!read.size) return text;
  let out = text;
  for (const [k, v] of read) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "giu"), v);
  }
  return out;
}

/** Does this word look like an Indonesian name, place or school term? */
export function looksIndonesian(word: string, idWords: Set<string> = new Set()) {
  const w = clean(word);
  if (!w) return false;
  if (idWords.has(w.toLowerCase())) return true;
  if (ID_TERMS.has(w) || ID_TERMS.has(w.replace(/\.$/, ""))) return true;
  if (/^(SD|SMP|SMA|SMK|MTs|MA)N?\d*$/.test(w)) return true;
  if (!/^\p{Lu}\p{Ll}+$/u.test(w)) return false; // proper nouns only from here
  if (EN_PROPER.has(w)) return false;
  if (ID_PROPER.has(w)) return true;
  // Spelling patterns that are distinctly Indonesian: ny, kh, sy, dj, tj, oe, ngg …
  if (/^(ny|dj|tj|sy|kh)|.(ny|kh|sy|dj|tj|oe|ngg|uw|iy)/i.test(w) && !/(sy|ny)$/i.test(w)) return true;
  // …or pure consonant-vowel syllables ending in a vowel (Budi, Rina, Dewi, Lestari).
  return w.length >= 4 && /^([bcdfghjklmnprstwyz]?[aiueo])+$/i.test(w) && /[aiu]$/.test(w);
}

const hourWordEn = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/** English rewrite: Indonesian time/number/date formats → forms English voices read correctly. */
export function normalizeEn(text: string) {
  let t = text;
  // Rp 10.000 → 10,000 rupiah
  t = t.replace(/\bRp\.?\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/g, (_, n: string) => `${Number(n.replace(/\./g, "")).toLocaleString("en-US")} rupiah`);
  // Dates 17/08/1945 or 17-08-1945
  t = t.replace(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g, (m, d, mo, y) => {
    const mi = Number(mo) - 1;
    return mi >= 0 && mi < 12 && Number(d) >= 1 && Number(d) <= 31 ? `${Number(d)} ${MONTHS_EN[mi]} ${y}` : m;
  });
  // Times: 07.30, 7:30, 13.45 WIB, "at 7.30"
  t = t.replace(new RegExp(`(\\b(?:at|by|until|till|from|to|around|about|before|after|pukul|jam)\\s+)?\\b(\\d{1,2})[.:](\\d{2})\\b(\\s*(?:am|pm)\\b)?(\\s*${TZ})?`, "gi"),
    (m, pre = "", hh: string, mm: string, ampm = "", tz = "") => {
      const h = Number(hh), min = Number(mm);
      const isTime = h <= 24 && min < 60 && (pre || ampm || tz || hh.length === 2 && hh.startsWith("0") || m.includes(":"));
      if (!isTime) return m;
      const p = /^(pukul|jam)\s+$/i.test(pre) ? "at " : pre;
      const suffix = ampm ? ` ${ampm.trim().toUpperCase()}` : h > 12 && h < 24 ? " PM" : "";
      const spoken = min === 0 ? `${hourWordEn(h)} o'clock` : `${hourWordEn(h)}:${mm}`;
      return `${p}${spoken}${suffix}${tz ? ` ${tz.trim()}` : ""}`;
    });
  t = t.replace(/\bNo\.\s?(?=\d)/g, "number ");
  // Thousands with dots → commas; Indonesian decimal comma → point
  t = t.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (n) => Number(n.replace(/\./g, "")).toLocaleString("en-US"));
  t = t.replace(/\b(\d+),(\d{1,2}|\d{4,})\b/g, "$1.$2");
  return t;
}

/** Indonesian rewrite so Indonesian voices read times, money, dates and abbreviations naturally. */
export function normalizeId(text: string) {
  let t = text;
  t = t.replace(/\bRp\.?\s?(\d{1,3}(?:\.\d{3})+|\d+)/g, (_, n: string) => `${n.replace(/\./g, "")} rupiah`);
  t = t.replace(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g, (m, d, mo, y) => {
    const mi = Number(mo) - 1;
    return mi >= 0 && mi < 12 && Number(d) >= 1 && Number(d) <= 31 ? `${Number(d)} ${MONTHS_ID[mi]} ${y}` : m;
  });
  t = t.replace(new RegExp(`(\\b(?:pukul|jam|at)\\s+)?\\b(\\d{1,2})[.:](\\d{2})\\b(\\s*${TZ})?`, "gi"), (m, pre = "", hh: string, mm: string, tz = "") => {
    const h = Number(hh), min = Number(mm);
    const isTime = h <= 24 && min < 60 && (pre || tz || hh.length === 2 && hh.startsWith("0") || m.includes(":"));
    if (!isTime) return m;
    const lead = pre && !/^at$/i.test(pre.trim()) ? pre.trim() : "pukul";
    const zone = tz ? ` ${tz.trim().split("").join(" ")}` : "";
    return `${lead} ${h}${min ? ` lewat ${min} menit` : ""}${zone}`;
  });
  const abbr: [RegExp, string][] = [
    [/\b(SD|SMP|SMA|SMK)N\b/g, "$1 Negeri"], [/\bMTsN\b/g, "M Ts Negeri"], [/\bMTs\b/g, "M Ts"],
    [/\bJln?\.\s?/g, "Jalan "], [/\bKec\.\s?/g, "Kecamatan "], [/\bKab\.\s?/g, "Kabupaten "], [/\bKel\.\s?/g, "Kelurahan "],
    [/\bProv\.\s?/g, "Provinsi "], [/\bNo\.\s?(?=\d)/g, "nomor "], [/\bBpk\.\s?/g, "Bapak "], [/\bHj\.\s?/g, "Hajah "],
    [/\bdll\.?/g, "dan lain-lain"], [/\bdsb\.?/g, "dan sebagainya"], [/\byg\b/g, "yang"], [/\bdgn\b/g, "dengan"], [/\bkls\b/gi, "kelas"],
    [/\bWITA\b/g, "wita"], [/\b(OSIS|PAUD)\b/g, "$1"],
  ];
  for (const [re, rep] of abbr) t = t.replace(re, rep);
  // Spell out initialisms letter by letter (SMA → "S M A").
  t = t.replace(/\b(SD|SMP|SMA|SMK|TK|MI|MA|SDIT|SMPIT|SMAIT|UIN|IAIN|UKS|RT|RW|WIB|WIT)\b/g, (m) => m.split("").join(" "));
  return t;
}

function splitSentences(text: string) {
  // Keep times / decimals ("07.30", "3.5") inside one sentence.
  return (text.replace(/\s+/g, " ").match(/(?:[^.!?\n]|\.(?=\d)|(?<=\b(?:Jl|Jln|Kec|Kab|Kel|Prov|No|Bpk|Hj|Mr|Mrs|Ms|Dr|St))\.)+[.!?]*|\n/g) ?? [text])
    .map((p) => p.trim()).filter(Boolean);
}

function sentenceTag(sentence: string, defaultTag: string, mode: SpeechMode) {
  if (mode === "id") return "id-ID";
  if (mode === "en") return "en-US";
  if (!defaultTag.startsWith("id")) return defaultTag;
  const words = (sentence.match(/[A-Za-z']+/g) ?? []).filter((w) => !looksIndonesian(w)).map((w) => w.toLowerCase());
  const en = words.filter((w) => EN_STOP.has(w) || (!ID_STOP.has(w) && EN_SHAPE.test(w))).length;
  const id = words.filter((w) => ID_STOP.has(w) || ID_SHAPE.test(w)).length;
  if (en >= 2 && en > id) return "en-US";
  return en >= 1 && id === 0 && words.length <= 3 ? "en-US" : defaultTag;
}

/** Splits an English sentence into runs so Indonesian names/terms go to the Indonesian voice. */
function splitEnglish(sentence: string, idWords: Set<string>): SpeechPart[] {
  const tokens = sentence.split(/(\s+)/);
  const words = tokens.filter((_, i) => i % 2 === 0);
  const isId = words.map((w) => looksIndonesian(w, idWords));
  // A number between Indonesian words belongs to them ("SMA Negeri 1 Makassar").
  words.forEach((w, i) => { if (!isId[i] && /^\d+[.,]?$/.test(w) && isId[i - 1] && isId[i + 1]) isId[i] = true; });
  // A number right after a school term too ("SMAN 3", "Jl. Merdeka No. 5").
  words.forEach((w, i) => { if (!isId[i] && /^\d+[.,]?$/.test(w) && isId[i - 1] && ID_TERMS.has(clean(words[i - 1]))) isId[i] = true; });
  if (!isId.some(Boolean)) return [{ text: sentence, tag: "en-US" }];
  const parts: SpeechPart[] = [];
  words.forEach((w, i) => {
    const tag = isId[i] ? "id-ID" : "en-US";
    const last = parts[parts.length - 1];
    if (last && last.tag === tag) last.text += ` ${w}`;
    else parts.push({ text: w, tag });
  });
  // Trailing punctuation of an Indonesian name stays with it; that's fine for pauses.
  return parts.filter((p) => clean(p.text) || p.tag === "en-US");
}

export function planSpeech(text: string, defaultTag = "id-ID", opts: SpeechOptions = {}): SpeechPart[] {
  if (!PAUSE_RE.test(text)) return planChunk(text, defaultTag, opts);
  const out: SpeechPart[] = [];
  const pieces = text.split(new RegExp(PAUSE_RE.source, "g")); // [text, ms, text, ms, …]
  pieces.forEach((piece, i) => {
    if (i % 2 === 1) {
      if (out.length && !out[out.length - 1].pause) out.push({ text: "", tag: "", pause: Number(piece) });
      return;
    }
    const chunk = piece.trim();
    if (!chunk) return;
    // A bare choice letter/number ("A", "B", "3") is spoken in the quiz language, not guessed.
    if (/^([A-Z]|\d{1,2})[.):]?$/.test(chunk)) {
      const tag = opts.mode === "en" ? "en-US" : opts.mode === "id" ? "id-ID" : defaultTag;
      out.push({ text: chunk.replace(/[.):]$/, ""), tag });
      return;
    }
    out.push(...planChunk(chunk, defaultTag, opts));
  });
  while (out.length && out[out.length - 1].pause) out.pop();
  return out;
}

function planChunk(text: string, defaultTag: string, opts: SpeechOptions): SpeechPart[] {
  const mode = opts.mode ?? "auto";
  const { read, idWords } = parseDict(opts.dict);
  const base = applyDict(text.replace(/\$+/g, ""), read).replace(/\b([ap])\.\s?m\.?(?=\s|$|[,;!?])/gi, "$1m");
  const out: SpeechPart[] = [];
  for (const sentence of splitSentences(base)) {
    const tag = sentenceTag(sentence, defaultTag, mode);
    const blanks = (s: string, t: string) => s.replace(/_{2,}/g, t.startsWith("en") ? " blank " : " titik-titik ");
    if (tag.startsWith("en")) {
      const parts = opts.idNames === false ? [{ text: sentence, tag }] : splitEnglish(sentence, idWords);
      for (const p of parts) out.push({ tag: p.tag, text: blanks(p.tag.startsWith("en") ? normalizeEn(p.text) : normalizeId(p.text), p.tag) });
    } else {
      out.push({ tag, text: blanks(tag.startsWith("id") ? normalizeId(sentence) : sentence, tag) });
    }
  }
  // Merge neighbours with the same voice so speech has fewer pauses.
  return out.reduce<SpeechPart[]>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last.tag === p.tag) last.text += ` ${p.text}`;
    else acc.push({ ...p });
    return acc;
  }, []).map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ").trim() })).filter((p) => p.text);
}
