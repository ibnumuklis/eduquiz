"use client";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { gradeAnswer } from "@/features/quizzes/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { formatScore } from "@/lib/utils";
import type { RubricItem } from "@/types";

/** Manual grading box: optional rubric scoring, total points and written feedback. */
export function GradePanel({
  answerId,
  attemptId,
  maxPoints,
  rubric,
  initialPoints,
  initialFeedback,
  initialRubric,
  onDone,
  compact = false,
}: {
  answerId: string;
  attemptId: string;
  maxPoints: number;
  rubric?: RubricItem[] | null;
  initialPoints?: number | null;
  initialFeedback?: string | null;
  initialRubric?: number[] | null;
  onDone?: () => void;
  compact?: boolean;
}) {
  const criteria = rubric?.filter((r) => r.criterion) ?? [];
  const [scores, setScores] = useState<string[]>(() => criteria.map((_, i) => initialRubric?.[i]?.toString() ?? ""));
  const rubricTotal = useMemo(() => scores.reduce((s, v) => s + (Number(v) || 0), 0), [scores]);
  const [value, setValue] = useState(initialPoints?.toString() ?? "");
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [pending, start] = useTransition();
  const effective = criteria.length && scores.some((s) => s !== "") ? Math.min(maxPoints, rubricTotal) : value === "" ? null : Number(value);

  const save = (points: number) =>
    start(async () => {
      const r = await gradeAnswer(answerId, points, attemptId, { feedback, rubric: criteria.length ? scores.map((s) => Number(s) || 0) : null });
      if (r.ok) { toast.success(r.message ?? "Tersimpan"); onDone?.(); } else toast.error(r.error);
    });

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      {criteria.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Rubrik</p>
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-amber-900">{c.criterion}</span>
              <Input type="number" min={0} max={c.points} step="0.5" value={scores[i]} aria-label={`Skor ${c.criterion}`}
                onChange={(e) => setScores((s) => s.map((x, k) => (k === i ? e.target.value : x)))} className="h-8 w-20 bg-white" />
              <span className="w-12 text-xs text-amber-700">/ {formatScore(c.points)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-amber-800">Nilai:</span>
        {criteria.length > 0 && scores.some((s) => s !== "") ? (
          <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-amber-900">{formatScore(effective ?? 0)}</span>
        ) : (
          <Input type="number" min={0} max={maxPoints} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-24 bg-white" aria-label="Poin" />
        )}
        <span className="text-sm text-amber-800">/ {formatScore(maxPoints)}</span>
        {!criteria.length && (
          <>
            <Button size="sm" variant="outline" onClick={() => setValue(String(maxPoints))}>Penuh</Button>
            <Button size="sm" variant="outline" onClick={() => setValue("0")}>Nol</Button>
          </>
        )}
      </div>
      {!compact && (
        <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={2000} className="min-h-0 bg-white"
          placeholder="Umpan balik untuk siswa (opsional)" aria-label="Umpan balik" />
      )}
      <Button size="sm" loading={pending} disabled={effective === null || effective > maxPoints} onClick={() => effective !== null && save(effective)}>
        Simpan nilai
      </Button>
    </div>
  );
}
