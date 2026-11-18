import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { getAttemptReview } from "@/features/attempts/queries";
import { PageHeader } from "@/components/ui/feedback";
import { ResultSummary } from "@/components/quiz/result-summary";
import { ReviewList } from "@/components/quiz/review-list";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Hasil Siswa" };

export default async function TeacherAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { id } = await params;
  const supabase = await createClient();
  const { data: attempt } = await supabase.from("quiz_attempts").select("id, quiz_id, student:profiles(full_name, email)").eq("id", id).maybeSingle();
  if (!attempt) notFound();
  const review = await getAttemptReview(id);
  if (!review?.result || !review.items) notFound();
  const student = (attempt as unknown as { student: { full_name: string; email: string } }).student;
  return (
    <>
      <PageHeader
        back={<Link href={`/teacher/quizzes/${review.quiz.id}/results`} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Laporan nilai</Link>}
        title={student?.full_name ?? "Siswa"}
        description={`${review.quiz.title} · percobaan ke-${review.attempt.attempt_number} · dikumpulkan ${formatDateTime(review.attempt.submitted_at, session.timezone)}${review.attempt.auto_submitted ? " (otomatis)" : ""}`}
      />
      <ResultSummary result={review.result} passingGrade={review.quiz.passing_grade} mode={review.quiz.mode} masteryTarget={review.quiz.mastery_target} />
      {(review.attempt.integrity_count ?? 0) > 0 && <p className="mt-3 text-sm text-amber-700">Tercatat {review.attempt.integrity_count} kejadian integritas (pindah tab / keluar layar penuh / salin-tempel) selama pengerjaan.</p>}
      <h2 className="mb-3 mt-8 text-lg font-bold text-slate-900">Jawaban siswa</h2>
      <ReviewList items={review.items} showKeys attemptId={id} canGrade />
    </>
  );
}
