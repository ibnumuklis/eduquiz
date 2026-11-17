import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getStudentQuizzes, type StudentQuizState } from "@/features/attempts/student-queries";
import { STATE_META } from "@/features/attempts/state-meta";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { StudentQuizCard } from "@/components/quiz/student-quiz-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Kuis" };

const TABS: (StudentQuizState | "all")[] = ["all", "available", "in_progress", "scheduled", "completed", "ended"];

export default async function StudentQuizzesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSchoolRole("student");
  const { tab = "all" } = await searchParams;
  const quizzes = await getStudentQuizzes(session.schoolId, session.userId);
  const visible = tab === "all" ? quizzes : quizzes.filter((q) => q.state === tab);
  return (
    <>
      <PageHeader title="Kuis" description="Semua kuis yang ditugaskan kepadamu" />
      <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Filter kuis">
        <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
          {TABS.map((t) => {
            const n = t === "all" ? quizzes.length : quizzes.filter((q) => q.state === t).length;
            return (
              <Link key={t} href={`/student/quizzes?tab=${t}`} className={cn("whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium", tab === t ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {t === "all" ? "Semua" : STATE_META[t].label} <span className="opacity-70">({n})</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {visible.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Tidak ada kuis di kategori ini" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((q) => <StudentQuizCard key={q.id} quiz={q} timezone={session.timezone} />)}</div>
      )}
    </>
  );
}
