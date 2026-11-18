"use client";
import { Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveState } from "@/features/live/actions";

export function LiveShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-dvh bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-900 text-white", className)}>
      {children}
    </div>
  );
}

export function TimerRing({ left, total, size = 88 }: { left: number; total: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? left / total : 0;
  const color = left <= 5 ? "#f43f5e" : left <= total / 2 ? "#f59e0b" : "#34d399";
  return (
    <div className="relative" style={{ width: size, height: size }} role="timer" aria-label={`Sisa ${left} detik`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.15)" strokeWidth={8} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .25s linear, stroke .3s" }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-2xl font-extrabold tabular-nums">{left}</span>
    </div>
  );
}

export function Leaderboard({ rows, compact }: { rows: LiveState["leaderboard"]; compact?: boolean }) {
  if (!rows.length) return <p className="text-center text-white/60">Belum ada peserta.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={`${r.rank}-${i}`}
          className={cn("flex items-center gap-3 rounded-2xl px-4 backdrop-blur transition-all",
            compact ? "py-2" : "py-3", r.me ? "bg-amber-400 text-slate-900" : "bg-white/10")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/20 text-sm font-bold">
            {r.rank === 1 ? <Crown className="h-4 w-4 text-amber-300" /> : r.rank <= 3 ? <Medal className="h-4 w-4" /> : r.rank}
          </span>
          <span className={cn("flex-1 truncate font-semibold", !compact && "text-lg")}>{r.name}{r.me ? " (kamu)" : ""}</span>
          <span className="font-mono font-bold tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}

export function Podium({ rows }: { rows: LiveState["leaderboard"] }) {
  const top = [rows[1], rows[0], rows[2]];
  const heights = ["h-28", "h-40", "h-20"];
  const tint = ["from-slate-300 to-slate-400", "from-amber-300 to-amber-500", "from-orange-300 to-orange-500"];
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {top.map((r, i) => r ? (
        <div key={i} className="flex w-28 flex-col items-center sm:w-40">
          <span className="mb-2 max-w-full truncate text-center text-sm font-bold sm:text-lg">{r.name}</span>
          <span className="mb-2 font-mono text-white/80">{r.score}</span>
          <div className={cn("grid w-full place-items-center rounded-t-2xl bg-gradient-to-b text-3xl font-black text-slate-900 shadow-xl", heights[i], tint[i])}>
            {r.rank}
          </div>
        </div>
      ) : <div key={i} className="w-28 sm:w-40" />)}
    </div>
  );
}
