import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { signImages } from "@/features/quizzes/queries";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import type { AttemptPayload } from "@/types";

export const metadata: Metadata = { title: "Mengerjakan Kuis" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attempt", { p_attempt: id });
  if (error || !data) notFound();
  const payload = data as AttemptPayload;
  if (payload.attempt.status !== "in_progress") redirect(`/student/results/${id}`);
  const urls = await signImages(supabase, payload.questions.flatMap((q) => [q.image_path, q.stimulus?.image_path]));
  payload.questions = payload.questions.map((q) => ({
    ...q,
    image_url: q.image_path ? urls.get(q.image_path) ?? null : null,
    stimulus: q.stimulus ? { ...q.stimulus, image_url: q.stimulus.image_path ? urls.get(q.stimulus.image_path) ?? null : null } : null,
  }));
  return <QuizPlayer payload={payload} />;
}
