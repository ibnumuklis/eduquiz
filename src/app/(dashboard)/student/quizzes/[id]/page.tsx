import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, ListChecks, Repeat, Target } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getStudentQuizzes } from "@/features/attempts/student-queries";
import { STATE_META } from "@/features/attempts/state-meta";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { StartQuizButton } from "./start-button";
import { formatDateTime, formatScore } from "@/lib/utils";

export const metadata: Metadata = { title: "Detail Kuis" };

export default async function StudentQuizDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("student");
  const { id } = await params;
  const quiz = (await getStudentQuizzes(session.schoolId, session.userId)).find((q) => q.id === id);
  if (!quiz) notFound();
  const supabase = await createClient();
  const { data: attempts } = await supabase
    .from("quiz_attempts").select("id, attempt_number, status, submitted_at").eq("quiz_id", id).eq("student_id", session.userId).order("attempt_number");
  const meta = STATE_META[quiz.state];
  const facts = [
    { icon: Clock, label: "Durasi", value: `${quiz.duration_minutes} menit` },
    quiz.mode === "practice"
      ? { icon: Repeat, label: "Mode latihan", value: `Ulangi sampai tuntas (${quiz.attemptsUsed}× latihan)` }
      : { icon: Repeat, label: "Batas percobaan", value: `${quiz.attemptsUsed}/${quiz.max_attempts} dipakai` },
    quiz.mode === "practice"
      ? { icon: Target, label: "Target penguasaan", value: formatScore(quiz.mastery_target) }
      : { icon: Target, label: "Passing grade", value: formatScore(quiz.passing_grade) },
    { icon: CalendarClock, label: "Dibuka", value: quiz.start_at ? formatDateTime(quiz.start_at, session.timezone) : "Sekarang" },
    { icon: CalendarClock, label: "Ditutup", value: quiz.end_at ? formatDateTime(quiz.end_at, session.timezone) : "Tidak dibatasi" },
    { icon: ListChecks, label: "Hasil", value: quiz.show_result ? "Ditampilkan setelah selesai" : "Dirahasiakan guru" },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/student/quizzes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Semua kuis</Link>
      <Card className="overflow-hidden">
        <div className="bg-brand-gradient p-6 text-white sm:p-8">
          <Badge className="bg-white/20 text-white">{meta.label}</Badge>
          <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">{quiz.title}</h1>
          <p className="mt-1 text-sm text-white/80">{quiz.subject?.name ?? "Umum"}{quiz.teacher ? ` · ${quiz.teacher.full_name}` : ""}</p>
        </div>
        <div className="space-y-6 p-6 sm:p-8">
          {quiz.description && <p className="whitespace-pre-wrap text-slate-700">{quiz.description}</p>}
          <dl className="grid gap-3 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.label} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <f.icon className="h-5 w-5 text-brand-500" />
                <div><dt className="text-xs text-slate-500">{f.label}</dt><dd className="text-sm font-semibold text-slate-800">{f.value}</dd></div>
              </div>
            ))}
          </dl>
          <Alert tone="info" title="Sebelum mulai">
            Timer berjalan sejak kamu menekan Mulai dan tetap berjalan walau halaman ditutup. Jawaban tersimpan otomatis; jika waktu habis, jawaban dikumpulkan otomatis.
          </Alert>
          {(quiz.mode === "exam" || quiz.require_fullscreen || quiz.detect_tab_switch || quiz.show_watermark) && (
            <Alert tone="warning" title={quiz.mode === "exam" ? "Mode ujian" : "Aturan pengerjaan"}>
              <ul className="list-inside list-disc space-y-0.5">
                {quiz.require_fullscreen && <li>Kuis dikerjakan dalam layar penuh.</li>}
                {quiz.detect_tab_switch && <li>Berpindah tab atau aplikasi akan tercatat untuk guru.</li>}
                {quiz.mode === "exam" && <li>Salin, tempel, dan klik kanan dinonaktifkan. Tidak ada power-up.</li>}
                {quiz.show_watermark && <li>Nama kamu tampil samar di layar sebagai tanda air.</li>}
              </ul>
            </Alert>
          )}
          {quiz.mode !== "exam" && (quiz.powerups_enabled || quiz.instant_feedback) && (
            <Alert tone="success" title="Fitur seru di kuis ini">
              {quiz.instant_feedback && "Periksa jawaban langsung setelah menjawab. "}
              {quiz.powerups_enabled && "Power-up: 50:50, Petunjuk, dan Kesempatan Kedua — masing-masing sekali pakai."}
            </Alert>
          )}
          {quiz.state === "in_progress" && quiz.openAttemptId && <Link href={`/attempt/${quiz.openAttemptId}`} className={buttonClass("primary", "lg", "w-full")}>Lanjutkan pengerjaan</Link>}
          {quiz.state === "available" && <StartQuizButton quizId={quiz.id} label={quiz.attemptsUsed ? (quiz.mode === "practice" ? "Latihan lagi (soal yang belum dikuasai)" : `Mulai percobaan ke-${quiz.attemptsUsed + 1}`) : "Mulai kuis"} />}
          {quiz.state === "scheduled" && <Alert tone="warning">Kuis dibuka pada {formatDateTime(quiz.start_at, session.timezone)}.</Alert>}
          {quiz.state === "ended" && <Alert tone="error">Waktu pengerjaan kuis sudah berakhir.</Alert>}
          {(attempts ?? []).filter((a) => a.status === "submitted").length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Riwayat percobaan</h2>
              <ul className="space-y-2">
                {(attempts ?? []).filter((a) => a.status === "submitted").map((a) => (
                  <li key={a.id}>
                    <Link href={`/student/results/${a.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50">
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Percobaan ke-{a.attempt_number}</span>
                      <span className="text-slate-500">{formatDateTime(a.submitted_at, session.timezone)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
