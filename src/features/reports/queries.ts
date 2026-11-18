import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportAttempt } from "@/lib/utils/report";

/** All submitted attempts of a quiz with student + class info. RLS limits this to quiz managers. */
export async function getQuizReport(quizId: string) {
  const supabase = await createClient();
  const [{ data: quiz }, { data: results }, { data: assignments }] = await Promise.all([
    supabase.from("quizzes").select("id, title, school_id, passing_grade, subject:subjects(name)").eq("id", quizId).maybeSingle(),
    supabase
      .from("quiz_results")
      .select("attempt_id, student_id, score, correct_count, wrong_count, unanswered_count, pending_manual, passed, duration_seconds, game_score, attempt:quiz_attempts(attempt_number, started_at, submitted_at, is_late, integrity_count), student:profiles(full_name, email)")
      .eq("quiz_id", quizId)
      .limit(5000),
    supabase.from("quiz_assignments").select("class_id, class:classes(name)").eq("quiz_id", quizId),
  ]);
  if (!quiz) return null;

  type Raw = {
    attempt_id: string; student_id: string; score: number; correct_count: number; wrong_count: number; unanswered_count: number;
    pending_manual: number; passed: boolean; duration_seconds: number; game_score: number;
    attempt: { attempt_number: number; started_at: string; submitted_at: string | null; is_late: boolean; integrity_count: number };
    student: { full_name: string; email: string };
  };
  const raw = (results ?? []) as unknown as Raw[];
  const studentIds = [...new Set(raw.map((r) => r.student_id))];
  const classIds = ((assignments ?? []) as { class_id: string }[]).map((a) => a.class_id);

  const [{ data: classRows }, { data: memberRows }] = await Promise.all([
    studentIds.length && classIds.length
      ? supabase.from("class_students").select("student_id, class:classes(name)").in("class_id", classIds).in("student_id", studentIds)
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabase.from("school_members").select("user_id, student_number").eq("school_id", quiz.school_id).in("user_id", studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const classOf = new Map<string, string>();
  ((classRows ?? []) as unknown as { student_id: string; class: { name: string } }[]).forEach((c) =>
    classOf.set(c.student_id, [classOf.get(c.student_id), c.class?.name].filter(Boolean).join(", ")),
  );
  const nisOf = new Map(((memberRows ?? []) as { user_id: string; student_number: string | null }[]).map((m) => [m.user_id, m.student_number]));

  const rows: ReportAttempt[] = raw.map((r) => ({
    attempt_id: r.attempt_id,
    student_id: r.student_id,
    student_name: r.student?.full_name ?? "—",
    email: r.student?.email ?? "",
    student_number: nisOf.get(r.student_id) ?? null,
    class_name: classOf.get(r.student_id) ?? "Kode akses",
    attempt_number: r.attempt?.attempt_number ?? 1,
    started_at: r.attempt?.started_at,
    submitted_at: r.attempt?.submitted_at ?? null,
    score: Number(r.score),
    correct_count: r.correct_count,
    wrong_count: r.wrong_count,
    unanswered_count: r.unanswered_count,
    pending_manual: r.pending_manual,
    passed: r.passed,
    duration_seconds: r.duration_seconds,
    is_late: r.attempt?.is_late ?? false,
    game_score: r.game_score ?? 0,
    integrity_count: r.attempt?.integrity_count ?? 0,
  }));
  return {
    quiz: quiz as unknown as { id: string; title: string; passing_grade: number; subject: { name: string } | null },
    rows,
    classes: ((assignments ?? []) as unknown as { class: { name: string } }[]).map((a) => a.class?.name).filter(Boolean) as string[],
  };
}
