import type { Metadata } from "next";
import Link from "next/link";
import { Crown, EyeOff, Trophy } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const session = await requireSchoolRole("student");
  const { class: classId } = await searchParams;
  const supabase = await createClient();
  const [{ data: classes }, { data: school }] = await Promise.all([
    supabase.from("class_students").select("class:classes(id, name)").eq("student_id", session.userId).eq("school_id", session.schoolId),
    supabase.from("schools").select("leaderboard_enabled").eq("id", session.schoolId).single(),
  ]);
  const myClasses = ((classes ?? []) as unknown as { class: { id: string; name: string } }[]).map((c) => c.class).filter(Boolean);
  const selected = myClasses.find((c) => c.id === classId)?.id ?? null;
  if (!school?.leaderboard_enabled) {
    return (<><PageHeader title="Leaderboard" /><EmptyState icon={EyeOff} title="Leaderboard dinonaktifkan" description="Sekolahmu menonaktifkan leaderboard untuk menjaga privasi." /></>);
  }
  const { data } = await supabase.rpc("get_leaderboard", { p_school: session.schoolId, p_class: selected });
  const rows = (data ?? []) as { rank: number; student_id: string; display_name: string; xp: number; level: number; is_me: boolean }[];
  const podium = ["from-amber-300 to-amber-500", "from-slate-300 to-slate-400", "from-orange-300 to-orange-500"];
  return (
    <>
      <PageHeader title="Leaderboard" description="Peringkat berdasarkan XP yang dikumpulkan di sekolah ini" />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/student/leaderboard" className={buttonClass(selected ? "outline" : "secondary", "sm")}>Seluruh sekolah</Link>
        {myClasses.map((c) => <Link key={c.id} href={`/student/leaderboard?class=${c.id}`} className={buttonClass(selected === c.id ? "secondary" : "outline", "sm")}>Kelas {c.name}</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState icon={Trophy} title="Belum ada data" description="Kerjakan kuis untuk mengumpulkan XP!" /> : (
        <Card>
          <ol className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.student_id} className={cn("flex items-center gap-4 px-5 py-3", r.is_me && "bg-brand-50")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold", r.rank <= 3 ? `bg-gradient-to-br ${podium[r.rank - 1]} text-white` : "bg-slate-100 text-slate-600")}>
                  {r.rank === 1 ? <Crown className="h-4 w-4" /> : r.rank}
                </span>
                <Avatar name={r.display_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{r.display_name} {r.is_me && <span className="text-xs font-semibold text-brand-600">(Kamu)</span>}</p>
                  <p className="text-xs text-slate-500">Level {r.level}</p>
                </div>
                <span className="font-bold text-brand-700">{r.xp} XP</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}
