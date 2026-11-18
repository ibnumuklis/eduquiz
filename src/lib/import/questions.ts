/**
 * Converts rows from the EDUQUIZ question template (Excel/CSV) into
 * save_question payloads. Pure & framework-free so it can be unit-tested.
 *
 * Columns (header names are case-insensitive):
 *   tipe | pertanyaan | opsi_a … opsi_j | kunci | bobot | pembahasan | kode_tp | petunjuk
 */
import type { QuestionTypeValue } from "@/lib/validations/quiz";

export const TEMPLATE_COLUMNS = [
  "tipe", "pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "opsi_e",
  "kunci", "bobot", "pembahasan", "kode_tp", "petunjuk",
] as const;

export const TYPE_CODES: Record<string, QuestionTypeValue> = {
  PG: "multiple_choice",
  PGK: "multiple_select",
  BS: "true_false",
  "PGK-BS": "tf_grid",
  GRID: "tf_grid",
  JODOH: "matching",
  MENJODOHKAN: "matching",
  URUT: "ordering",
  MENGURUTKAN: "ordering",
  ISIAN: "short_answer",
  RUMPANG: "fill_blank",
  URAIAN: "essay",
  ESAI: "essay",
  POLLING: "poll",
  POLL: "poll",
  WORDCLOUD: "word_cloud",
  "WORD-CLOUD": "word_cloud",
};

export const TYPE_HELP: { code: string; type: string; how: string }[] = [
  { code: "PG", type: "Pilihan ganda", how: "Isi opsi_a…opsi_e. Kunci = satu huruf, mis. B" },
  { code: "PGK", type: "Pilihan ganda kompleks", how: "Kunci = beberapa huruf dipisah koma, mis. A,C" },
  { code: "BS", type: "Benar / Salah", how: "Opsi tidak perlu diisi. Kunci = B (benar) atau S (salah)" },
  { code: "PGK-BS", type: "PGK Benar/Salah per pernyataan", how: "Setiap opsi = satu pernyataan. Kunci = B/S berurutan, mis. B,S,B" },
  { code: "JODOH", type: "Menjodohkan", how: "Setiap opsi ditulis \"kiri = kanan\", mis. Makassar = Sulawesi Selatan" },
  { code: "URUT", type: "Mengurutkan", how: "Tulis opsi dalam urutan yang BENAR. Siswa melihatnya teracak" },
  { code: "ISIAN", type: "Jawaban singkat", how: "Kunci = jawaban; beberapa jawaban dipisah |, mis. Jakarta|DKI Jakarta" },
  { code: "RUMPANG", type: "Isian rumpang", how: "Tandai bagian kosong dengan ___ di pertanyaan. Kunci seperti ISIAN" },
  { code: "URAIAN", type: "Uraian (dikoreksi guru)", how: "Kunci (opsional) = rubrik: kriteria=poin; kriteria=poin" },
  { code: "POLLING", type: "Polling (tidak dinilai)", how: "Isi opsi pilihan. Kunci dikosongkan" },
  { code: "WORDCLOUD", type: "Word cloud (tidak dinilai)", how: "Hanya pertanyaan. Siswa menjawab 1–3 kata" },
];

export interface ImportOption { label: string; is_correct: boolean; match_text?: string }
export interface ImportPayload {
  row: number;
  type: QuestionTypeValue;
  prompt: string;
  points: number;
  explanation: string;
  options: ImportOption[];
  accepted_answers: string[];
  manual_grading: boolean;
  objective_code?: string;
  payload: { hint?: string; rubric?: { criterion: string; points: number }[] };
}
export interface ImportError { row: number; message: string }

const LETTERS = "ABCDEFGHIJ".split("");
const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v)).replace(/\r\n?/g, "\n").trim();

/** Normalizes header names: lowercase, spaces/dots -> underscore ("Opsi A" -> "opsi_a"). */
export function normalizeHeader(h: string) {
  return norm(h).toLowerCase().replace(/[\s.]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function splitList(v: string, sep: RegExp) {
  return v.split(sep).map((s) => s.trim()).filter(Boolean);
}

export function parseQuestionRows(rows: Record<string, unknown>[], firstDataRow = 2) {
  const payloads: ImportPayload[] = [];
  const errors: ImportError[] = [];

  rows.forEach((raw, i) => {
    const rowNo = firstDataRow + i;
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) r[normalizeHeader(k)] = norm(v);
    if (Object.values(r).every((v) => v === "")) return; // blank line

    const code = (r.tipe || "").toUpperCase().replace(/\s+/g, "");
    const type = TYPE_CODES[code];
    const err = (message: string) => errors.push({ row: rowNo, message });
    if (!type) return err(`Tipe "${r.tipe || "(kosong)"}" tidak dikenal. Gunakan: ${Object.keys(TYPE_CODES).slice(0, 11).join(", ")}`);
    if (!r.pertanyaan) return err("Kolom pertanyaan wajib diisi");

    const points = r.bobot ? Number(r.bobot.replace(",", ".")) : 10;
    if (!Number.isFinite(points) || points <= 0 || points > 1000) return err("Bobot harus angka 0–1000");

    const opts = LETTERS.map((l) => r[`opsi_${l.toLowerCase()}`] ?? "").filter((v) => v !== "");
    const key = r.kunci ?? "";
    const base: ImportPayload = {
      row: rowNo, type, prompt: r.pertanyaan, points, explanation: r.pembahasan ?? "",
      options: [], accepted_answers: [], manual_grading: false,
      ...(r.kode_tp ? { objective_code: r.kode_tp } : {}),
      payload: r.petunjuk ? { hint: r.petunjuk } : {},
    };

    switch (type) {
      case "multiple_choice":
      case "multiple_select": {
        if (opts.length < 2) return err("Minimal 2 opsi (opsi_a dan opsi_b)");
        const letters = splitList(key.toUpperCase(), /[,;\s]+/);
        if (!letters.length) return err("Kolom kunci wajib diisi (huruf opsi yang benar)");
        const bad = letters.find((l) => !LETTERS.includes(l) || LETTERS.indexOf(l) >= opts.length);
        if (bad) return err(`Kunci "${bad}" tidak sesuai dengan opsi yang tersedia`);
        if (type === "multiple_choice" && letters.length !== 1) return err("Pilihan ganda (PG) hanya boleh satu kunci; gunakan PGK untuk lebih dari satu");
        base.options = opts.map((label, k) => ({ label, is_correct: letters.includes(LETTERS[k]) }));
        break;
      }
      case "true_false": {
        const k = key.toUpperCase();
        const truth = ["B", "BENAR", "TRUE", "T"].includes(k) ? true : ["S", "SALAH", "FALSE", "F"].includes(k) ? false : null;
        if (truth === null) return err("Kunci Benar/Salah harus B atau S");
        base.options = [{ label: "Benar", is_correct: truth }, { label: "Salah", is_correct: !truth }];
        break;
      }
      case "tf_grid": {
        if (opts.length < 2) return err("PGK-BS memerlukan minimal 2 pernyataan");
        const marks = splitList(key.toUpperCase(), /[,;\s]+/);
        if (marks.length !== opts.length) return err(`Jumlah kunci (${marks.length}) harus sama dengan jumlah pernyataan (${opts.length})`);
        if (marks.some((m) => !["B", "S"].includes(m))) return err("Kunci PGK-BS hanya berisi B atau S, mis. B,S,B");
        base.options = opts.map((label, k) => ({ label, is_correct: marks[k] === "B" }));
        break;
      }
      case "matching": {
        if (opts.length < 2) return err("Menjodohkan memerlukan minimal 2 pasangan");
        const pairs = opts.map((o) => {
          const idx = o.indexOf("=");
          return idx < 0 ? null : { label: o.slice(0, idx).trim(), match_text: o.slice(idx + 1).trim() };
        });
        if (pairs.some((p) => !p || !p.label || !p.match_text)) return err('Setiap opsi menjodohkan ditulis "kiri = kanan"');
        base.options = pairs.map((p) => ({ label: p!.label, match_text: p!.match_text, is_correct: false }));
        break;
      }
      case "ordering":
      case "poll": {
        if (opts.length < 2) return err("Minimal 2 opsi");
        base.options = opts.map((label) => ({ label, is_correct: false }));
        break;
      }
      case "short_answer":
      case "fill_blank": {
        const answers = splitList(key, /\|/);
        if (!answers.length) base.manual_grading = true;
        base.accepted_answers = answers;
        break;
      }
      case "essay": {
        base.manual_grading = true;
        if (key) {
          const rubric = splitList(key, /;/).map((part) => {
            const idx = part.lastIndexOf("=");
            const points = idx < 0 ? 0 : Number(part.slice(idx + 1).replace(",", "."));
            return { criterion: (idx < 0 ? part : part.slice(0, idx)).trim(), points: Number.isFinite(points) ? points : 0 };
          });
          base.payload.rubric = rubric.slice(0, 10);
        }
        break;
      }
      case "word_cloud":
        break;
    }
    payloads.push(base);
  });

  return { payloads, errors };
}

/** Example rows for the downloadable template. */
export const TEMPLATE_EXAMPLES: Record<(typeof TEMPLATE_COLUMNS)[number], string | number>[] = [
  { tipe: "PG", pertanyaan: "Ibu kota Provinsi Sulawesi Selatan adalah …", opsi_a: "Manado", opsi_b: "Makassar", opsi_c: "Kendari", opsi_d: "Palu", opsi_e: "", kunci: "B", bobot: 10, pembahasan: "Makassar adalah ibu kota Sulawesi Selatan.", kode_tp: "", petunjuk: "Dijuluki Kota Daeng" },
  { tipe: "PGK", pertanyaan: "Manakah yang termasuk bilangan prima?", opsi_a: "2", opsi_b: "4", opsi_c: "7", opsi_d: "9", opsi_e: "", kunci: "A,C", bobot: 10, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "BS", pertanyaan: "Air mendidih pada suhu 100 °C di permukaan laut.", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "", opsi_e: "", kunci: "B", bobot: 5, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "PGK-BS", pertanyaan: "Tentukan Benar atau Salah setiap pernyataan berikut.", opsi_a: "Matahari adalah bintang", opsi_b: "Bulan memancarkan cahaya sendiri", opsi_c: "Bumi berotasi dari barat ke timur", opsi_d: "", opsi_e: "", kunci: "B,S,B", bobot: 15, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "JODOH", pertanyaan: "Jodohkan provinsi dengan ibu kotanya.", opsi_a: "Sulawesi Selatan = Makassar", opsi_b: "Jawa Barat = Bandung", opsi_c: "Bali = Denpasar", opsi_d: "", opsi_e: "", kunci: "", bobot: 15, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "URUT", pertanyaan: "Urutkan tahapan metode ilmiah.", opsi_a: "Merumuskan masalah", opsi_b: "Menyusun hipotesis", opsi_c: "Melakukan eksperimen", opsi_d: "Menarik kesimpulan", opsi_e: "", kunci: "", bobot: 10, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "ISIAN", pertanyaan: "Ibu kota Indonesia saat ini adalah …", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "", opsi_e: "", kunci: "Jakarta|DKI Jakarta", bobot: 5, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "URAIAN", pertanyaan: "Jelaskan proses fotosintesis!", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "", opsi_e: "", kunci: "Menyebut klorofil & cahaya=4; Menyebut hasil glukosa & oksigen=6", bobot: 10, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "POLLING", pertanyaan: "Seberapa paham kamu materi hari ini?", opsi_a: "Sangat paham", opsi_b: "Cukup", opsi_c: "Belum paham", opsi_d: "", opsi_e: "", kunci: "", bobot: 1, pembahasan: "", kode_tp: "", petunjuk: "" },
  { tipe: "WORDCLOUD", pertanyaan: "Satu kata yang menggambarkan pelajaran hari ini?", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "", opsi_e: "", kunci: "", bobot: 1, pembahasan: "", kode_tp: "", petunjuk: "" },
];
