import type { Metadata } from "next";
import { Flame, Lock, Star } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card, StatCard } from "@/components/ui/card";
import { PageHeader, ProgressBar } from "@/components/ui/feedback";
import { AchievementIcon } from "@/components/quiz/achievement-icon";
import { cn, formatDate, levelProgress } from "@/lib/utils";

export const metadata: Metadata = { title: "Pencapaian" };

export default async function AchievementsPage() {
  const session = await requireSchoolRole("student");
  const supabase = await createClient();
  const [{ data: all }, { data: mine }] = await Promise.all([
    supabase.from("achievements").select("id, code, name, description, icon, xp_reward").order("xp_reward"),
    supabase.from("student_achievements").select("achievement_id, earned_at").eq("student_id", session.userId),
  ]);
  const earned = new Map((mine ?? []).map((m) => [m.achievement_id as string, m.earned_at as string]));
  const p = session.profile;
  const lv = levelProgress(p.xp);
  return (
    <>
      <PageHeader title="Pencapaian" description={`${earned.size} dari ${all?.length ?? 0} badge terbuka`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Level" value={lv.level} icon={Star} tone="amber" hint={`${p.xp} XP total`} />
        <StatCard label="Streak saat ini" value={`${p.current_streak} hari`} icon={Flame} tone="rose" />
        <StatCard label="Streak terbaik" value={`${p.longest_streak} hari`} icon={Flame} tone="violet" />
      </div>
      <Card className="mt-4 p-5">
        <div className="flex justify-between text-sm"><span className="font-semibold text-slate-800">Menuju level {lv.level + 1}</span><span className="text-slate-500">{lv.current}/{lv.needed} XP</span></div>
        <ProgressBar value={lv.pct} className="mt-2 h-3" />
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(all ?? []).map((a) => {
          const at = earned.get(a.id);
          return (
            <Card key={a.id} className={cn("flex items-center gap-4 p-5", !at && "opacity-60")}>
              <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", at ? "bg-gradient-to-br from-amber-300 to-orange-400 text-white shadow-lg shadow-amber-500/30" : "bg-slate-100 text-slate-400")}>
                {at ? <AchievementIcon icon={a.icon} className="h-7 w-7" /> : <Lock className="h-6 w-6" />}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{a.name}</p>
                <p className="text-xs text-slate-500">{a.description}</p>
                <p className="mt-1 text-xs font-semibold text-accent-600">+{a.xp_reward} XP {at && <span className="font-normal text-slate-400">· {formatDate(at, session.timezone)}</span>}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
