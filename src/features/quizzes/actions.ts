"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionErrorMessage, authorize } from "@/lib/permissions/action";
import { questionSchema, quizSettingsSchema, type QuestionInput } from "@/lib/validations/quiz";
import { fail, invalid } from "@/lib/utils/errors";
import { localInputToISO } from "@/lib/utils";
import type { ActionResult } from "@/types";

function parseSettings(formData: FormData, tz: string) {
  const parsed = quizSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return parsed;
  return {
    ...parsed,
    data: { ...parsed.data, start_at: localInputToISO(parsed.data.start_at, tz), end_at: localInputToISO(parsed.data.end_at, tz) },
  };
}

const quizPaths = (id: string) => {
  revalidatePath("/teacher/quizzes");
  revalidatePath(`/teacher/quizzes/${id}`, "layout");
};

export async function createQuiz(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { session, supabase } = await authorize("teacher");
    const parsed = parseSettings(formData, session.timezone);
    if (!parsed.success) return invalid(parsed.error);
    const { data, error } = await supabase
      .from("quizzes")
      .insert({ ...parsed.data, school_id: session.schoolId, teacher_id: session.userId })
      .select("id")
      .single();
    if (error) return fail(error);
    id = data.id;
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
  revalidatePath("/teacher/quizzes");
  redirect(`/teacher/quizzes/${id}?created=1`);
}

export async function updateQuizSettings(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("teacher");
    const parsed = parseSettings(formData, session.timezone);
    if (!parsed.success) return invalid(parsed.error);
    const { data, error } = await supabase.from("quizzes").update(parsed.data).eq("id", id).select("id");
    if (error) return fail(error);
    if (!data?.length) return fail("Kuis tidak ditemukan atau Anda tidak berhak mengubahnya");
    quizPaths(id);
    return { ok: true, message: "Pengaturan kuis disimpan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function deleteQuiz(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    const { data, error } = await supabase.from("quizzes").delete().eq("id", id).select("id");
    if (error) return fail(error);
    if (!data?.length) return fail("Kuis tidak ditemukan atau Anda tidak berhak menghapusnya");
    revalidatePath("/teacher/quizzes");
    return { ok: true, message: "Kuis dihapus" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

async function quizRpc(fn: string, id: string, message: string): Promise<ActionResult<unknown>> {
  try {
    const { supabase } = await authorize("teacher");
    const { data, error } = await supabase.rpc(fn, { p_quiz: id });
    if (error) return fail(error);
    quizPaths(id);
    return { ok: true, data, message };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function publishQuiz(id: string) {
  return quizRpc("publish_quiz", id, "Kuis dipublikasikan & siswa diberi notifikasi");
}
export async function closeQuiz(id: string) {
  return quizRpc("close_quiz", id, "Kuis ditutup; pengerjaan yang berjalan dikumpulkan otomatis");
}
export async function unpublishQuiz(id: string) {
  return quizRpc("unpublish_quiz", id, "Kuis dikembalikan ke draft");
}
export async function regenerateAccessCode(id: string) {
  return quizRpc("regenerate_access_code", id, "Kode akses baru dibuat");
}

export async function duplicateQuiz(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await authorize("teacher");
    const { data, error } = await supabase.rpc("duplicate_quiz", { p_quiz: id });
    if (error) return fail(error);
    revalidatePath("/teacher/quizzes");
    return { ok: true, data: { id: data as string }, message: "Kuis diduplikasi sebagai draft" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function setAssignments(quizId: string, classIds: string[]): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    const { data: current, error: e1 } = await supabase.from("quiz_assignments").select("class_id").eq("quiz_id", quizId);
    if (e1) return fail(e1);
    const have = new Set((current ?? []).map((c) => c.class_id as string));
    const want = new Set(classIds);
    const toAdd = [...want].filter((c) => !have.has(c));
    const toRemove = [...have].filter((c) => !want.has(c));
    if (toAdd.length) {
      const { error } = await supabase.from("quiz_assignments").insert(toAdd.map((class_id) => ({ quiz_id: quizId, class_id })));
      if (error) return fail(error);
    }
    if (toRemove.length) {
      const { error } = await supabase.from("quiz_assignments").delete().eq("quiz_id", quizId).in("class_id", toRemove);
      if (error) return fail(error);
    }
    quizPaths(quizId);
    return { ok: true, message: "Penugasan kelas disimpan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Questions -------------------------------------------------------
export async function saveQuestion(quizId: string, questionId: string | null, input: QuestionInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await authorize("teacher");
    const parsed = questionSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { data, error } = await supabase.rpc("save_question", {
      p_quiz: quizId,
      p_question: questionId,
      p_data: { ...parsed.data, options: parsed.data.options.map((o) => ({ ...o, id: o.id || null })) },
    });
    if (error) return fail(error);
    quizPaths(quizId);
    return { ok: true, data: { id: data as string }, message: "Soal disimpan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function deleteQuestion(quizId: string, questionId: string): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    const { data, error } = await supabase.from("quiz_questions").delete().eq("id", questionId).eq("quiz_id", quizId).select("id");
    if (error) return fail(error);
    if (!data?.length) return fail("Soal tidak ditemukan");
    quizPaths(quizId);
    return { ok: true, message: "Soal dihapus" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function duplicateQuestion(quizId: string, questionId: string): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    const { error } = await supabase.rpc("duplicate_question", { p_question: questionId });
    if (error) return fail(error);
    quizPaths(quizId);
    return { ok: true, message: "Soal diduplikasi" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function reorderQuestions(quizId: string, ids: string[]): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    const { error } = await supabase.rpc("reorder_questions", { p_quiz: quizId, p_ids: ids });
    if (error) return fail(error);
    quizPaths(quizId);
    return { ok: true };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function copyQuestionsToQuiz(targetQuizId: string, questionIds: string[]): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    if (!questionIds.length) return fail("Pilih minimal satu soal");
    const { data, error } = await supabase.rpc("copy_questions_to_quiz", { p_target_quiz: targetQuizId, p_question_ids: questionIds });
    if (error) return fail(error);
    quizPaths(targetQuizId);
    revalidatePath("/teacher/bank");
    return { ok: true, message: `${data} soal disalin ke kuis` };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Grading ---------------------------------------------------------
export async function gradeAnswer(answerId: string, points: number, attemptId: string): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("teacher");
    if (!Number.isFinite(points) || points < 0) return fail("Nilai tidak valid");
    const { error } = await supabase.rpc("grade_answer", { p_answer: answerId, p_points: points });
    if (error) return fail(error);
    revalidatePath("/teacher/grading");
    revalidatePath(`/teacher/attempts/${attemptId}`);
    return { ok: true, message: "Nilai disimpan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}
