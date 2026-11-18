import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LearningObjective, Question, Quiz, Stimulus } from "@/types";

export const QUIZ_MEDIA_BUCKET = "quiz-media";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Creates short-lived signed URLs for private quiz images (storage RLS applies). */
export async function signImages(supabase: Client, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await supabase.storage.from(QUIZ_MEDIA_BUCKET).createSignedUrls(unique, 60 * 60 * 3);
  data?.forEach((d) => d.path && d.signedUrl && map.set(d.path, d.signedUrl));
  return map;
}

export interface TeacherQuiz extends Quiz {
  subject: { id: string; name: string } | null;
  quiz_assignments: { class_id: string; class: { name: string } | null }[];
}

/** Quiz the current teacher manages (RLS returns nothing otherwise → 404). */
export const getManagedQuiz = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quizzes")
    .select("*, subject:subjects(id, name), quiz_assignments(class_id, class:classes(name))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  // Students can read quizzes too; ensure the caller can see answer keys (i.e. manages it).
  const { data: canManage } = await supabase.rpc("can_manage_quiz", { p_quiz: id });
  if (!canManage) notFound();
  return data as unknown as TeacherQuiz;
});

export async function getQuizQuestions(quizId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_questions")
    .select("*, question_options(*)")
    .eq("quiz_id", quizId)
    .order("position")
    .order("created_at");
  const questions = ((data ?? []) as unknown as Question[]).map((q) => ({
    ...q,
    points: Number(q.points),
    question_options: [...q.question_options].sort((a, b) => a.position - b.position),
  }));
  const urls = await signImages(supabase, questions.map((q) => q.image_path));
  return questions.map((q) => ({ ...q, image_url: q.image_path ? urls.get(q.image_path) ?? null : null }));
}

export type QuestionWithImage = Awaited<ReturnType<typeof getQuizQuestions>>[number];

export async function getQuizStimuli(quizId: string): Promise<Stimulus[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("quiz_stimuli").select("id, title, content, image_path").eq("quiz_id", quizId).order("created_at");
  const rows = (data ?? []) as Stimulus[];
  const urls = await signImages(supabase, rows.map((s) => s.image_path));
  return rows.map((s) => ({ ...s, image_url: s.image_path ? urls.get(s.image_path) ?? null : null }));
}

export async function getSchoolObjectives(schoolId: string, subjectId?: string | null) {
  const supabase = await createClient();
  let q = supabase.from("learning_objectives").select("id, code, description, subject_id, phase, grade_level, created_by").eq("school_id", schoolId).order("code");
  if (subjectId) q = q.or(`subject_id.eq.${subjectId},subject_id.is.null`);
  const { data } = await q;
  return (data ?? []) as LearningObjective[];
}

export async function getMyFolders(schoolId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("quiz_folders").select("id, name, color").eq("school_id", schoolId).order("name");
  return (data ?? []) as { id: string; name: string; color: string }[];
}
