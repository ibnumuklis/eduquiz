"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionErrorMessage, authorize } from "@/lib/permissions/action";
import { fail } from "@/lib/utils/errors";
import type { ActionResult } from "@/types";

const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,10}$/, "Kode kuis tidak valid");

export async function startAttempt(quizId: string): Promise<ActionResult> {
  let attemptId: string;
  try {
    const { supabase } = await authorize("student");
    if (!z.string().uuid().safeParse(quizId).success) return fail("Kuis tidak valid");
    const { data, error } = await supabase.rpc("start_attempt", { p_quiz: quizId });
    if (error) return fail(error);
    attemptId = data as string;
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
  redirect(`/attempt/${attemptId}`);
}

export async function startAttemptByCode(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let attemptId: string;
  try {
    const { supabase } = await authorize("student");
    const parsed = codeSchema.safeParse(formData.get("code"));
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { data, error } = await supabase.rpc("start_attempt", { p_code: parsed.data });
    if (error) return fail(error);
    attemptId = data as string;
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
  redirect(`/attempt/${attemptId}`);
}
