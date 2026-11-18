import type { Metadata } from "next";
import Link from "next/link";
import { Award, Flame, GraduationCap, KeyRound, Sparkles, Star, Trophy } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { getStudentQuizzes } from "@/features/attempts/student-queries";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Badge, EmptyState, ProgressBar } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { StudentQuizCard } from "@/components/quiz/student-quiz-card";
import { AchievementIcon } from "@/components/quiz/achievement-icon";
import { formatRelative, formatScore, levelProgress } from "@/lib/utils";

export const metadata: Metadata = { title: "Dasbor Siswa" };

export default async function StudentDashboard() {
  const session = await requireSchoolRole("student");
  const supabase = await createClient();
  const [quizzes, { data: classes }, { data: results }, { data: achievements }] = await Promise.all([
    getStudentQuizzes(session.schoolId, session.userId),
    supabase.from("class_students").select("class:classes(name)").eq("student_id", session.userId).eq("school_id", session.schoolId),
    supabase.from("quiz_results").select("attempt_id, score, passed, created_at, quiz:quizzes(title)").eq("student_id", session.userId).eq("school_id", session.schoolId).order("created_at", { ascending: false }).limit(5),
    supabase.from("student_achievements").select("earned_at, achievement:achievements(code, name, icon)").eq("student_id", session.userId).order("earned_at", { ascending: false }).limit(6),
  ]);
  const p = session.profile;
  const lv = levelProgress(p.xp);
  const firstName = p.full_name.split(" ")[0] || "Siswa";
  const inProgress = quizzes.filter((q) => q.state === "in_progress");
  const available = quizzes.filter((q) => q.state === "available");
  const completed = quizzes.filter((q) => q.state === "completed").length;
  const classNames = ((classes ?? []) as unknown as { class: { name: string } }[]).map((c) => c.class?.name).filter(Boolean);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: session.timezone }).format(new Date()));
  const greeting = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-brand-gradient p-6 text-white sm:p-8 animate-fade-in">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-accent-400/20" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-white/80">{greeting},</p>
            <h1 className="text-3xl font-extrabold">{firstName}! 🚀</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80"><GraduationCap className="h-4 w-4" /> {classNames.length ? `Kelas ${classNames.join(", ")}` : "Belum terdaftar di kelas"}</p>
          </div>
          <div className="w-full max-w-sm rounded-2xl bg-white/15 p-4 backdrop-blur">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-bold"><Star className="h-4 w-4 fill-amber-300 text-amber-300" /> Level {lv.level}</span>
              <span className="text-white/80">{p.xp} XP</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-accent-400 transition-all" style={{ width: `${lv.pct}%` }} /></div>
            <p className="mt-1.5 text-xs text-white/70">{lv.needed - lv.current} XP lagi menuju level {lv.level + 1}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Kuis tersedia" value={available.length} icon={Sparkles} tone="accent" />
        <StatCard label="Kuis selesai" value={completed} icon={Trophy} tone="violet" />
        <StatCard label="Streak belajar" value={`${p.current_streak} hari`} icon={Flame} tone="amber" hint={`Terbaik ${p.longest_streak} hari`} />
        <StatCard label="Pencapaian" value={achievements?.length ?? 0} icon={Award} tone="brand" />
      </div>

      {inProgress.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Sedang dikerjakan</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{inProgress.map((q) => <StudentQuizCard key={q.id} quiz={q} timezone={session.timezone} />)}</div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Kuis tersedia</h2>
          <div className="flex gap-2">
            <Link href="/student/join" className={buttonClass("outline", "sm")}><KeyRound className="h-4 w-4" /> Punya kode?</Link>
            <Link href="/student/quizzes" className={buttonClass("ghost", "sm")}>Semua kuis</Link>
          </div>
        </div>
        {available.length === 0 ? (
          <EmptyState icon={Sparkles} title="Belum ada kuis baru" description="Kuis yang ditugaskan guru akan muncul di sini. Kamu juga bisa bergabung memakai kode kuis." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{available.slice(0, 6).map((q) => <StudentQuizCard key={q.id} quiz={q} timezone={session.timezone} />)}</div>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Nilai terbaru" action={<Link href="/student/history" className="text-sm font-semibold text-brand-600">Riwayat</Link>} />
          {(results ?? []).length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Belum ada nilai</p> : (
            <ul className="divide-y divide-slate-100">
              {((results ?? []) as unknown as { attempt_id: string; score: number; passed: boolean; created_at: string; quiz: { title: string } }[]).map((r) => (
                <li key={r.attempt_id}>
                  <Link href={`/student/results/${r.attempt_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium text-slate-800">{r.quiz?.title}</p><p className="text-xs text-slate-500">{formatRelative(r.created_at)}</p></div>
                    <Badge tone={r.passed ? "green" : "red"} className="shrink-0">{formatScore(r.score)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Pencapaian terbaru" action={<Link href="/student/achievements" className="text-sm font-semibold text-brand-600">Semua</Link>} />
          <CardBody>
            {(achievements ?? []).length === 0 ? <p className="py-4 text-center text-sm text-slate-500">Selesaikan kuis untuk membuka badge pertamamu!</p> : (
              <div className="grid grid-cols-3 gap-3">
                {((achievements ?? []) as unknown as { earned_at: string; achievement: { code: string; name: string; icon: string } }[]).map((a) => (
                  <div key={a.achievement.code} className="flex flex-col items-center rounded-2xl bg-gradient-to-b from-amber-50 to-white p-3 text-center">
                    <AchievementIcon icon={a.achievement.icon} className="h-8 w-8 text-amber-500" />
                    <p className="mt-2 text-xs font-semibold text-slate-700">{a.achievement.name}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4"><ProgressBar value={lv.pct} tone="accent" /></div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
