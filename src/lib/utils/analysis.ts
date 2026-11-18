/** Item analysis & Kurikulum Merdeka mastery helpers (pure functions). */

export interface AnalysisQuestion {
  id: string;
  no: number;
  type: string;
  prompt: string;
  points: number;
  objective_id: string | null;
  responses: number;
  p_value: number | null;
  options: { id: string; label: string; is_correct: boolean; match_text: string | null; count: number }[];
  words: { text: string; count: number }[] | null;
}
export interface AnalysisStudent {
  student_id: string;
  name: string;
  student_number: string | null;
  class_name: string | null;
  attempt_id: string;
  attempts: number;
  score: number | null;
  passed: boolean | null;
  mastered: boolean | null;
  game_score: number | null;
  integrity_count: number;
  /** ratio 0..1, -1 = not answered, -2 = awaiting manual grading, null/undefined = not served */
  cells: Record<string, number | null>;
}
export interface AnalysisObjective { id: string; code: string; description: string }
export interface QuizAnalysis {
  quiz: { id: string; title: string; passing_grade: number; mastery_target: number; mode: string };
  objectives: AnalysisObjective[];
  questions: AnalysisQuestion[];
  students: AnalysisStudent[];
}

export function difficultyLabel(p: number | null | undefined): { label: string; tone: "green" | "amber" | "red" | "slate" } {
  if (p === null || p === undefined) return { label: "—", tone: "slate" };
  if (p >= 0.7) return { label: "Mudah", tone: "green" };
  if (p >= 0.3) return { label: "Sedang", tone: "amber" };
  return { label: "Sukar", tone: "red" };
}

/** Upper–lower 27% discrimination index. Returns null when there are fewer than 4 students. */
export function discriminationIndex(students: AnalysisStudent[], questionId: string): number | null {
  const scored = students.filter((s) => s.score !== null && typeof s.cells[questionId] === "number" && (s.cells[questionId] as number) !== -2);
  if (scored.length < 4) return null;
  const sorted = [...scored].sort((a, b) => Number(b.score) - Number(a.score));
  const n = Math.max(1, Math.round(sorted.length * 0.27));
  const avg = (group: AnalysisStudent[]) => group.reduce((s, x) => s + Math.max(0, x.cells[questionId] as number), 0) / group.length;
  return Math.round((avg(sorted.slice(0, n)) - avg(sorted.slice(-n))) * 100) / 100;
}

export function discriminationLabel(d: number | null): { label: string; tone: "green" | "amber" | "red" | "slate" } {
  if (d === null) return { label: "—", tone: "slate" };
  if (d >= 0.4) return { label: "Sangat baik", tone: "green" };
  if (d >= 0.2) return { label: "Cukup", tone: "amber" };
  return { label: "Perlu revisi", tone: "red" };
}

/** Average ratio per objective for one student (only questions they were served & graded). */
export function objectiveMastery(student: AnalysisStudent, questions: AnalysisQuestion[], objectives: AnalysisObjective[]) {
  const out: Record<string, number | null> = {};
  for (const o of objectives) {
    const vals = questions
      .filter((q) => q.objective_id === o.id)
      .map((q) => student.cells[q.id])
      .filter((v): v is number => typeof v === "number" && v !== -2)
      .map((v) => Math.max(0, v));
    out[o.id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : null;
  }
  return out;
}

function lowerFirst(s: string) {
  const t = s.trim().replace(/[.;]+$/, "");
  return t.charAt(0).toLowerCase() + t.slice(1);
}
function joinId(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, dan ${items[items.length - 1]}`;
}

/**
 * Draft deskripsi capaian kompetensi (rapor Kurikulum Merdeka) from per-TP mastery.
 * Teachers are expected to review & edit before using it.
 */
export function raporDescription(name: string, mastery: Record<string, number | null>, objectives: AnalysisObjective[], threshold: number) {
  const first = name.trim().split(/\s+/)[0] || "Ananda";
  const strong = objectives.filter((o) => (mastery[o.id] ?? -1) >= threshold).sort((a, b) => (mastery[b.id] ?? 0) - (mastery[a.id] ?? 0));
  const weak = objectives.filter((o) => mastery[o.id] !== null && mastery[o.id] !== undefined && (mastery[o.id] as number) < threshold)
    .sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0));
  const parts: string[] = [];
  if (strong.length) parts.push(`Ananda ${first} menunjukkan penguasaan yang baik dalam ${joinId(strong.slice(0, 3).map((o) => lowerFirst(o.description)))}.`);
  if (weak.length) parts.push(`${strong.length ? "Ananda" : `Ananda ${first}`} perlu bimbingan dalam ${joinId(weak.slice(0, 3).map((o) => lowerFirst(o.description)))}.`);
  if (!parts.length) return `Belum ada data capaian tujuan pembelajaran untuk ${first}.`;
  return parts.join(" ");
}

/** Heatmap cell colour classes. */
export function cellTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "bg-slate-50 text-slate-300";
  if (v === -2) return "bg-amber-100 text-amber-700";
  if (v === -1) return "bg-slate-200 text-slate-500";
  if (v >= 1) return "bg-emerald-500 text-white";
  if (v >= 0.5) return "bg-emerald-200 text-emerald-900";
  if (v > 0) return "bg-amber-200 text-amber-900";
  return "bg-rose-400 text-white";
}
