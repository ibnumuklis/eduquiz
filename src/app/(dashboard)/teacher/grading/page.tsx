import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { GradingQueue, type PendingAnswer } from "./grading-queue";

export const metadata: Metadata = { title: "Koreksi Jawaban" };

export default async function GradingPage() {
  const session = await requireSchoolRole("teacher");
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_answers")
    .select("id, attempt_id, text_answer, updated_at, question:quiz_questions!inner(prompt, points, accepted_answers, quiz:quizzes!inner(id, title, teacher_id)), student:profiles(full_name)")
    .eq("school_id", session.schoolId)
    .eq("needs_manual_grading", true)
    .eq("question.quiz.teacher_id", session.userId)
    .order("updated_at")
    .limit(100);
  const rows = (data ?? []) as unknown as PendingAnswer[];
  return (
    <>
      <PageHeader title="Koreksi Jawaban" description="Jawaban singkat yang memerlukan penilaian manual" />
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Tidak ada jawaban yang perlu dikoreksi" description="Semua jawaban sudah dinilai. Kerja bagus!" action={<Link href="/teacher" className="text-sm font-semibold text-brand-600">Kembali ke dasbor</Link>} />
      ) : (
        <Card><GradingQueue rows={rows} /></Card>
      )}
    </>
  );
}
