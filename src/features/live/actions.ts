"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionErrorMessage, authorize } from "@/lib/permissions/action";
import { fail } from "@/lib/utils/errors";
import type { ActionResult } from "@/types";

export async function startLive(quizId: string, seconds: number): Promise<ActionResult> {
  let id: string;
  try {
    const { supabase } = await authorize("teacher");
    if (!z.string().uuid().safeParse(quizId).success) return fail("Kuis tidak valid");
    const { data, error } = await supabase.rpc("live_create", { p_quiz: quizId, p_seconds: Math.round(seconds) });
    if (error) return fail(error);
    id = data as string;
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
  redirect(`/live/host/${id}`);
}

export async function joinLive(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { supabase } = await authorize("student");
    const code = String(formData.get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) return fail("Kode Live terdiri dari 6 angka");
    const { data, error } = await supabase.rpc("live_join", { p_code: code });
    if (error) return fail(error);
    id = data as string;
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
  redirect(`/live/play/${id}`);
}

export type LiveOption = { id: string; label: string; is_correct?: boolean | null; count?: number | null };
export type LiveState = {
  session: { id: string; code: string; status: "lobby" | "question" | "reveal" | "ended"; current_index: number; total: number; question_seconds: number; question_started_at: string | null; server_now: string };
  quiz: { id: string; title: string; language: string | null };
  is_host: boolean;
  players_count: number;
  players?: string[] | null;
  question: null | {
    id: string; type: string; prompt: string; image_path: string | null; image_url?: string | null; points: number;
    options: LiveOption[]; accepted_answers?: string[] | null; explanation?: string | null;
    words?: { text: string; count: number }[] | null; answered?: number | null;
  };
  leaderboard: { rank: number; score: number; name: string; me?: boolean }[];
  me?: { score: number; rank: number | null; answered: boolean; last?: { is_correct: boolean | null; points: number } | null } | null;
};

async function client() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sesi berakhir, silakan masuk lagi");
  return supabase;
}

export async function fetchLiveState(sessionId: string): Promise<ActionResult<LiveState>> {
  try {
    if (!z.string().uuid().safeParse(sessionId).success) return fail("Sesi tidak valid");
    const supabase = await client();
    const { data, error } = await supabase.rpc("live_state", { p_session: sessionId });
    if (error) return fail(error);
    const state = data as LiveState;
    if (state.question?.image_path) {
      const { data: signed } = await supabase.storage.from("quiz-media").createSignedUrl(state.question.image_path, 3600);
      state.question.image_url = signed?.signedUrl ?? null;
    }
    return { ok: true, data: state };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function liveControl(sessionId: string, action: "next" | "reveal" | "end"): Promise<ActionResult> {
  try {
    if (!z.string().uuid().safeParse(sessionId).success) return fail("Sesi tidak valid");
    const supabase = await client();
    const { error } = await supabase.rpc("live_control", { p_session: sessionId, p_action: action });
    if (error) return fail(error);
    return { ok: true };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function liveAnswer(sessionId: string, selected: string[], text: string | null): Promise<ActionResult> {
  try {
    if (!z.string().uuid().safeParse(sessionId).success) return fail("Sesi tidak valid");
    const ids = selected.filter((s) => z.string().uuid().safeParse(s).success).slice(0, 20);
    const supabase = await client();
    const { error } = await supabase.rpc("live_answer", { p_session: sessionId, p_selected: ids, p_text: text ? text.slice(0, 200) : null });
    if (error) return fail(error);
    return { ok: true };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}
