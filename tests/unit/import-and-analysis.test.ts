import { describe, expect, it } from "vitest";
import { normalizeHeader, parseQuestionRows, TEMPLATE_EXAMPLES } from "@/lib/import/questions";
import { difficultyLabel, discriminationIndex, objectiveMastery, raporDescription, type AnalysisStudent } from "@/lib/utils/analysis";
import { keySummary, pickLine, CHEERS } from "@/lib/utils/quiz";
import { questionSchema } from "@/lib/validations/quiz";

describe("question import parser", () => {
  it("accepts every template example row", () => {
    const { payloads, errors } = parseQuestionRows(TEMPLATE_EXAMPLES);
    expect(errors).toEqual([]);
    expect(payloads.map((p) => p.type)).toEqual([
      "multiple_choice", "multiple_select", "true_false", "tf_grid", "matching", "ordering", "short_answer", "essay", "poll", "word_cloud",
    ]);
    // every parsed payload must also pass the app's own question schema
    for (const p of payloads) expect(questionSchema.safeParse(p).success, `row ${p.row}`).toBe(true);
  });

  it("maps keys for each type", () => {
    const { payloads } = parseQuestionRows(TEMPLATE_EXAMPLES);
    expect(payloads[0].options.find((o) => o.is_correct)?.label).toBe("Makassar");
    expect(payloads[1].options.filter((o) => o.is_correct).map((o) => o.label)).toEqual(["2", "7"]);
    expect(payloads[3].options.map((o) => o.is_correct)).toEqual([true, false, true]);
    expect(payloads[4].options[0]).toMatchObject({ label: "Sulawesi Selatan", match_text: "Makassar" });
    expect(payloads[6].accepted_answers).toEqual(["Jakarta", "DKI Jakarta"]);
    expect(payloads[7].payload.rubric).toEqual([{ criterion: "Menyebut klorofil & cahaya", points: 4 }, { criterion: "Menyebut hasil glukosa & oksigen", points: 6 }]);
    expect(payloads[0].payload.hint).toBe("Dijuluki Kota Daeng");
  });

  it("reports precise row errors and skips blank rows", () => {
    const { payloads, errors } = parseQuestionRows([
      { tipe: "PG", pertanyaan: "x", opsi_a: "a", opsi_b: "b", kunci: "C" },
      {},
      { tipe: "XYZ", pertanyaan: "x" },
      { tipe: "PGK-BS", pertanyaan: "x", opsi_a: "a", opsi_b: "b", kunci: "B" },
      { tipe: "JODOH", pertanyaan: "x", opsi_a: "a", opsi_b: "b = c" },
      { tipe: "PG", pertanyaan: "x", opsi_a: "a", opsi_b: "b", kunci: "A,B" },
      { tipe: "ISIAN", pertanyaan: "Tanpa kunci" },
      { tipe: "pg", pertanyaan: "ok", opsi_a: "a", opsi_b: "b", kunci: "b", bobot: "7,5" },
    ]);
    expect(errors.map((e) => e.row)).toEqual([2, 4, 5, 6, 7]);
    expect(errors[0].message).toMatch(/tidak sesuai/);
    expect(errors[2].message).toMatch(/Jumlah kunci/);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ row: 8, type: "short_answer", manual_grading: true });
    expect(payloads[1]).toMatchObject({ row: 9, points: 7.5 });
  });

  it("normalizes header names", () => {
    expect(normalizeHeader(" Opsi A ")).toBe("opsi_a");
    expect(normalizeHeader("Kode TP")).toBe("kode_tp");
  });
});

describe("analysis helpers", () => {
  const student = (id: string, score: number, cells: Record<string, number | null>): AnalysisStudent => ({
    student_id: id, name: `Siswa ${id}`, student_number: null, class_name: null, attempt_id: id, attempts: 1,
    score, passed: score >= 70, mastered: null, game_score: 0, integrity_count: 0, cells,
  });

  it("labels difficulty", () => {
    expect(difficultyLabel(0.9).label).toBe("Mudah");
    expect(difficultyLabel(0.5).label).toBe("Sedang");
    expect(difficultyLabel(0.1).label).toBe("Sukar");
  });

  it("computes a positive discrimination index for a good item", () => {
    const students = [student("a", 100, { q: 1 }), student("b", 90, { q: 1 }), student("c", 40, { q: 0 }), student("d", 30, { q: 0 })];
    expect(discriminationIndex(students, "q")).toBe(1);
    expect(discriminationIndex(students.slice(0, 3), "q")).toBeNull();
  });

  it("aggregates mastery per objective and drafts a rapor description", () => {
    const objectives = [
      { id: "o1", code: "TP-1", description: "Menganalisis struktur teks eksposisi" },
      { id: "o2", code: "TP-2", description: "Menulis paragraf argumentasi." },
    ];
    const questions = [
      { id: "q1", objective_id: "o1" }, { id: "q2", objective_id: "o1" }, { id: "q3", objective_id: "o2" },
    ].map((q, i) => ({ ...q, no: i + 1, type: "multiple_choice", prompt: "", points: 10, responses: 1, p_value: 1, options: [], words: null }));
    const s = student("x", 60, { q1: 1, q2: 0.5, q3: -1 });
    const m = objectiveMastery(s, questions, objectives);
    expect(m).toEqual({ o1: 75, o2: 0 });
    const text = raporDescription("Ani Lestari", m, objectives, 70);
    expect(text).toBe("Ananda Ani menunjukkan penguasaan yang baik dalam menganalisis struktur teks eksposisi. Ananda perlu bimbingan dalam menulis paragraf argumentasi.");
  });
});

describe("quiz helpers", () => {
  it("summarizes keys for every type", () => {
    expect(keySummary("tf_grid", [{ label: "a", is_correct: true }, { label: "b", is_correct: false }])).toBe("1. B  2. S");
    expect(keySummary("matching", [{ label: "Sulsel", is_correct: false, match_text: "Makassar" }])).toBe("Sulsel → Makassar");
    expect(keySummary("ordering", [{ label: "Dua", is_correct: false, position: 1 }, { label: "Satu", is_correct: false, position: 0 }])).toBe("Satu → Dua");
    expect(keySummary("poll", [])).toBe("tidak dinilai");
  });
  it("picks feedback lines deterministically", () => {
    expect(pickLine(CHEERS, "abc")).toBe(pickLine(CHEERS, "abc"));
  });
});
