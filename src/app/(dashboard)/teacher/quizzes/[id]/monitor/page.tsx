import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz } from "@/features/quizzes/queries";
import { createClient } from "@/lib/supabase/server";
import { LiveMonitor } from "./live-monitor";
import type { MonitorRow } from "@/types";

export const metadata: Metadata = { title: "Monitoring Kuis" };

export default async function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_quiz_monitor", { p_quiz: id });
  if (error) throw new Error(error.message);
  return <LiveMonitor quizId={quiz.id} initial={(data ?? []) as MonitorRow[]} timezone={session.timezone} />;
}
