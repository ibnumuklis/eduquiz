import { describe, expect, it } from "vitest";
import { isoToLocalInput, levelForXp, levelProgress, localInputToISO, safeRedirect, xpForLevel, formatDuration } from "@/lib/utils";
import { distribution, rankStudents, summarize, toCsv, type ReportAttempt } from "@/lib/utils/report";
import { questionSchema, quizSettingsSchema } from "@/lib/validations/quiz";
import { registerSchema } from "@/lib/validations/auth";
import { dbErrorMessage } from "@/lib/utils/errors";

const row = (o: Partial<ReportAttempt>): ReportAttempt => ({
  attempt_id: crypto.randomUUID(), student_id: "s1", student_name: "A", email: "", student_number: null, class_name: "X",
  attempt_number: 1, started_at: "", submitted_at: null, score: 0, correct_count: 0, wrong_count: 0, unanswered_count: 0,
  pending_manual: 0, passed: false, duration_seconds: 100, is_late: false, ...o,
});

describe("gamification levels (mirror of SQL _level_for_xp)", () => {
  it("computes levels", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(200)).toBe(3);
    expect(levelForXp(800)).toBe(5);
    expect(xpForLevel(5)).toBe(800);
  });
  it("progress within a level", () => {
    expect(levelProgress(125)).toEqual({ level: 2, current: 75, needed: 150, pct: 50 });
  });
});

describe("timezone conversion for schedule inputs", () => {
  it("round-trips WITA (UTC+8)", () => {
    const iso = localInputToISO("2026-11-18T08:00", "Asia/Makassar");
    expect(iso).toBe("2026-11-18T00:00:00.000Z");
    expect(isoToLocalInput(iso, "Asia/Makassar")).toBe("2026-11-18T08:00");
  });
  it("handles WIB (UTC+7) and empty values", () => {
    expect(localInputToISO("2026-01-01T00:30", "Asia/Jakarta")).toBe("2025-12-31T17:30:00.000Z");
    expect(localInputToISO("", "Asia/Jakarta")).toBeNull();
  });
});

describe("safeRedirect prevents open redirects", () => {
  it.each([
    ["/teacher", "/teacher"],
    ["https://evil.com", "/dashboard"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    [null, "/dashboard"],
  ])("%s -> %s", (input, out) => expect(safeRedirect(input)).toBe(out));
});

describe("reports", () => {
  it("ranks best attempt per student with shared ranks for ties", () => {
    const ranked = rankStudents([
      row({ student_id: "a", student_name: "Ani", score: 80 }),
      row({ student_id: "a", student_name: "Ani", score: 95 }),
      row({ student_id: "b", student_name: "Budi", score: 95, duration_seconds: 50 }),
      row({ student_id: "c", student_name: "Citra", score: 60 }),
    ]);
    expect(ranked.map((r) => [r.student_name, r.rank, r.score])).toEqual([["Budi", 1, 95], ["Ani", 1, 95], ["Citra", 3, 60]]);
    expect(ranked.find((r) => r.student_name === "Ani")?.attempts).toBe(2);
  });
  it("summarizes scores", () => {
    expect(summarize([60, 80, 100], 70)).toEqual({ count: 3, average: 80, highest: 100, lowest: 60, median: 80, passRate: 67 });
    expect(summarize([], 70).average).toBeNull();
  });
  it("buckets scores", () => {
    const d = distribution([0, 49.9, 50, 100, 90]);
    expect(d.find((b) => b.range === "0-49")?.count).toBe(2);
    expect(d.find((b) => b.range === "90-100")?.count).toBe(2);
  });
  it("escapes CSV and neutralizes formula injection", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(1)", 'x,"y"']]);
    expect(csv).toBe(`a,b\r\n'=HYPERLINK(1),"x,""y"""`);
  });
  it("formats durations", () => {
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("validation", () => {
  it("requires exactly one correct option for multiple choice", () => {
    const base = { type: "multiple_choice" as const, prompt: "Q", points: 1 };
    expect(questionSchema.safeParse({ ...base, options: [{ label: "a", is_correct: true }, { label: "b", is_correct: true }] }).success).toBe(false);
    expect(questionSchema.safeParse({ ...base, options: [{ label: "a", is_correct: true }, { label: "b", is_correct: false }] }).success).toBe(true);
  });
  it("short answers need a key unless manual grading", () => {
    expect(questionSchema.safeParse({ type: "short_answer", prompt: "Q", points: 1 }).success).toBe(false);
    expect(questionSchema.safeParse({ type: "short_answer", prompt: "Q", points: 1, manual_grading: true }).success).toBe(true);
    expect(questionSchema.safeParse({ type: "fill_blank", prompt: "Q ___", points: 1, accepted_answers: ["x"] }).success).toBe(true);
  });
  it("rejects an end date before the start date", () => {
    const r = quizSettingsSchema.safeParse({ title: "Kuis", access: "assigned", duration_minutes: 30, max_attempts: 1, passing_grade: 70, start_at: "2026-11-20T10:00", end_at: "2026-11-20T09:00" });
    expect(r.success).toBe(false);
  });
  it("enforces password strength and confirmation", () => {
    expect(registerSchema.safeParse({ full_name: "Ani", email: "a@b.co", password: "password", confirm_password: "password" }).success).toBe(false);
    expect(registerSchema.safeParse({ full_name: "Ani", email: "a@b.co", password: "passw0rd!", confirm_password: "passw0rd" }).success).toBe(false);
    expect(registerSchema.safeParse({ full_name: "Ani", email: "A@B.co", password: "passw0rd", confirm_password: "passw0rd" }).success).toBe(true);
  });
  it("maps database errors to safe messages", () => {
    expect(dbErrorMessage({ code: "P0001", message: "Kuis belum dimulai" })).toBe("Kuis belum dimulai");
    expect(dbErrorMessage({ code: "42501", message: "permission denied for table x" })).toMatch(/tidak memiliki akses/);
    expect(dbErrorMessage({ code: "XX000", message: "internal stack trace" })).not.toMatch(/stack/);
  });
});
