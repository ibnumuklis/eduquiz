export interface ReportAttempt {
  attempt_id: string;
  student_id: string;
  student_name: string;
  email: string;
  student_number: string | null;
  class_name: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  score: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  pending_manual: number;
  passed: boolean;
  duration_seconds: number;
  is_late: boolean;
  game_score?: number;
  integrity_count?: number;
}

export interface RankedStudent extends ReportAttempt {
  rank: number;
  attempts: number;
}

/** Best attempt per student, ranked (ties share a rank, "1224" style). */
export function rankStudents(rows: ReportAttempt[]): RankedStudent[] {
  const best = new Map<string, ReportAttempt & { attempts: number }>();
  for (const r of rows) {
    const cur = best.get(r.student_id);
    const attempts = (cur?.attempts ?? 0) + 1;
    if (!cur || r.score > cur.score || (r.score === cur.score && r.duration_seconds < cur.duration_seconds)) {
      best.set(r.student_id, { ...r, attempts });
    } else {
      cur.attempts = attempts;
    }
  }
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.duration_seconds - b.duration_seconds || a.student_name.localeCompare(b.student_name));
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((r, i) => {
    if (prev === null || r.score !== prev) rank = i + 1;
    prev = r.score;
    return { ...r, rank };
  });
}

export function summarize(scores: number[], passingGrade: number) {
  if (!scores.length) return { count: 0, average: null, highest: null, lowest: null, median: null, passRate: null };
  const sorted = [...scores].sort((a, b) => a - b);
  const sum = sorted.reduce((s, x) => s + x, 0);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    average: Math.round((sum / sorted.length) * 10) / 10,
    highest: sorted[sorted.length - 1],
    lowest: sorted[0],
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    passRate: Math.round((sorted.filter((s) => s >= passingGrade).length / sorted.length) * 100),
  };
}

export const SCORE_BUCKETS = [
  { range: "0-49", lo: 0, hi: 50 },
  { range: "50-59", lo: 50, hi: 60 },
  { range: "60-69", lo: 60, hi: 70 },
  { range: "70-79", lo: 70, hi: 80 },
  { range: "80-89", lo: 80, hi: 90 },
  { range: "90-100", lo: 90, hi: 101 },
];

export function distribution(scores: number[]) {
  return SCORE_BUCKETS.map((b) => ({ range: b.range, count: scores.filter((s) => s >= b.lo && s < b.hi).length }));
}

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: string | number | boolean | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
