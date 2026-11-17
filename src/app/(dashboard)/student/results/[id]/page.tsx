import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getAttemptReview } from "@/features/attempts/queries";
import { PageHeader, EmptyState, Alert } from "@/components/ui/feedback";
import { ResultSummary } from "@/components/quiz/result-summary";
import { ReviewList } from "@/components/quiz/review-list";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Hasil Kuis" };

export default async function StudentResultPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("student");
  const { id } = await params;
  const review = await getAttemptReview(id);
  if (!review) notFound();
  const back = <Link href="/student" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Dasbor</Link>;

  if (!review.visible || !review.result) {
    return (
      <>
        <PageHeader back={back} title={review.quiz.title} description={`Dikumpulkan ${formatDateTime(review.attempt.submitted_at, session.timezone)}`} />
        <EmptyState icon={EyeOff} title="Jawaban berhasil dikumpulkan ✅" description="Gurumu memilih untuk tidak menampilkan nilai pada kuis ini. Nilai akan diinformasikan oleh guru." action={<Link href="/student" className={buttonClass()}>Kembali ke dasbor</Link>} />
      </>
    );
  }
  return (
    <>
      <PageHeader
        back={back}
        title={review.quiz.title}
        description={`Percobaan ke-${review.attempt.attempt_number} · dikumpulkan ${formatDateTime(review.attempt.submitted_at, session.timezone)}${review.attempt.auto_submitted ? " (otomatis saat waktu habis)" : ""}`}
        actions={<Link href="/student/quizzes" className={buttonClass("outline")}>Kuis lainnya</Link>}
      />
      <ResultSummary result={review.result} passingGrade={review.quiz.passing_grade} />
      {review.result.pending_manual > 0 && <Alert tone="warning" className="mt-6">Ada {review.result.pending_manual} jawaban yang sedang dikoreksi guru. Nilai akhir bisa berubah — kamu akan mendapat notifikasi.</Alert>}
      {review.items && review.items.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold text-slate-900">{review.show_keys ? "Pembahasan" : "Jawabanmu"}</h2>
          {!review.show_keys && <p className="mb-3 text-sm text-slate-500">Kunci jawaban dan pembahasan tidak ditampilkan oleh guru.</p>}
          <ReviewList items={review.items} showKeys={Boolean(review.show_keys)} attemptId={id} />
        </>
      )}
    </>
  );
}
