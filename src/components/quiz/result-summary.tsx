import { CheckCircle2, Clock, Hourglass, MinusCircle, Sparkles, XCircle } from "lucide-react";
import { cn, formatDuration, formatScore } from "@/lib/utils";
import type { QuizResult } from "@/types";

export function ResultSummary({ result, passingGrade }: { result: QuizResult; passingGrade?: number }) {
  const pending = result.pending_manual > 0;
  const passed = result.passed && !pending;
  const pct = result.points_possible > 0 ? Math.round((Number(result.points_earned) / Number(result.points_possible)) * 100) : 0;
  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className={cn("relative overflow-hidden rounded-3xl p-6 text-center text-white", pending ? "bg-gradient-to-br from-amber-500 to-orange-500" : passed ? "bg-brand-gradient" : "bg-gradient-to-br from-rose-500 to-pink-600")}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-white/80">Nilai Anda</p>
        <p className="mt-1 text-6xl font-extrabold tabular-nums">{formatScore(result.score)}</p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
          {pending ? "Menunggu koreksi guru" : passed ? "Lulus 🎉" : "Belum lulus"}
        </p>
        {passingGrade !== undefined && <p className="mt-2 text-xs text-white/70">Passing grade {formatScore(passingGrade)}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { icon: CheckCircle2, label: "Benar", value: result.correct_count, cls: "text-emerald-600 bg-emerald-50" },
          { icon: XCircle, label: "Salah", value: result.wrong_count, cls: "text-rose-600 bg-rose-50" },
          { icon: MinusCircle, label: "Tidak dijawab", value: result.unanswered_count, cls: "text-slate-500 bg-slate-100" },
          { icon: Sparkles, label: "Persentase", value: `${pct}%`, cls: "text-brand-600 bg-brand-50" },
          { icon: Clock, label: "Waktu pengerjaan", value: formatDuration(result.duration_seconds), cls: "text-violet-600 bg-violet-50" },
          { icon: Hourglass, label: "XP diperoleh", value: `+${result.xp_awarded}`, cls: "text-accent-600 bg-accent-50" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white p-4">
            <span className={cn("grid h-9 w-9 place-items-center rounded-xl", s.cls)}><s.icon className="h-5 w-5" /></span>
            <p className="mt-3 text-xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
