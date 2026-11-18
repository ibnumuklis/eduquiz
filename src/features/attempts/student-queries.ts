import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Quiz } from "@/types";

export type StudentQuizState = "available" | "in_progress" | "scheduled" | "completed" | "ended";

export interface StudentQuiz extends Quiz {
  subject: { name: string } | null;
  teacher: { full_name: string } | null;
  state: StudentQuizState;
  attemptsUsed: number;
  openAttemptId: string | null;
  lastAttemptId: string | null;
  bestScore: number | null;
}

/** Quizzes visible to the student (RLS: assigned to their class or previously attempted). */
export async function getStudentQuizzes(schoolId: string, userId: string): Promise<StudentQuiz[]> {
  const supabase = await createClient();
  const [{ data: quizzes }, { data: attempts }, { data: results }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("*, subject:subjects(name), teacher:profiles(full_name)")
      .eq("school_id", schoolId)
      .in("status", ["published", "closed"])
      .order("published_at", { ascending: false })
      .limit(300),
    supabase.from("quiz_attempts").select("id, quiz_id, status, attempt_number, created_at").eq("student_id", userId).eq("school_id", schoolId),
    supabase.from("quiz_results").select("quiz_id, attempt_id, score, mastered").eq("student_id", userId).eq("school_id", schoolId),
  ]);
  const now = Date.now();
  return ((quizzes ?? []) as unknown as (Quiz & { subject: { name: string } | null; teacher: { full_name: string } | null })[]).map((q) => {
    const mine = (attempts ?? []).filter((a) => a.quiz_id === q.id).sort((a, b) => b.attempt_number - a.attempt_number);
    const open = mine.find((a) => a.status === "in_progress");
    const mineResults = (results ?? []).filter((r) => r.quiz_id === q.id);
    const scores = mineResults.map((r) => Number(r.score));
    const mastered = mineResults.some((r) => r.mastered);
    // Practice mode: retries are open until the student reaches the mastery target.
    const limit = q.mode === "practice" ? (mastered ? mine.length : 50) : q.max_attempts;
    const ended = q.status === "closed" || (q.end_at && new Date(q.end_at).getTime() <= now);
    const notYet = q.start_at && new Date(q.start_at).getTime() > now;
    let state: StudentQuizState;
    if (open) state = "in_progress";
    else if (ended) state = mine.length ? "completed" : "ended";
    else if (notYet) state = "scheduled";
    else if (mine.length >= limit) state = "completed";
    else state = "available";
    return {
      ...q,
      state,
      attemptsUsed: mine.length,
      openAttemptId: open?.id ?? null,
      lastAttemptId: mine.find((a) => a.status === "submitted")?.id ?? null,
      bestScore: scores.length ? Math.max(...scores) : null,
    };
  });
}
