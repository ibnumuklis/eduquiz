"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookText, CheckCircle2, Copy, FileQuestion, FileSpreadsheet, ImageIcon, Lightbulb, Pencil, Plus, Printer, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteQuestion, duplicateQuestion, reorderQuestions } from "@/features/quizzes/actions";
import { QuestionEditor, type EditableQuestion } from "@/components/quiz/question-editor";
import { ImportQuestionsDialog } from "@/components/quiz/import-questions-dialog";
import { StimulusManager } from "@/components/quiz/stimulus-manager";
import { QUESTION_TYPE_LABEL, SURVEY_TYPES } from "@/lib/validations/quiz";
import { keySummary } from "@/lib/utils/quiz";
import { buttonClass } from "@/components/ui/button";
import type { Stimulus } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { cn, formatScore } from "@/lib/utils";

const CHOICE = new Set(["multiple_choice", "multiple_select", "true_false"]);

export function QuestionBuilder({
  quizId, schoolId, questions, stimuli, objectives,
}: {
  quizId: string; schoolId: string; questions: EditableQuestion[]; stimuli: Stimulus[];
  objectives: { id: string; code: string; description: string }[];
}) {
  const [editing, setEditing] = useState<EditableQuestion | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [stimOpen, setStimOpen] = useState(false);
  const objectiveById = new Map(objectives.map((o) => [o.id, o]));
  const stimById = new Map(stimuli.map((s) => [s.id, s]));
  const usage = questions.reduce<Record<string, number>>((acc, q) => (q.stimulus_id ? { ...acc, [q.stimulus_id]: (acc[q.stimulus_id] ?? 0) + 1 } : acc), {});
  const [del, setDel] = useState<EditableQuestion | null>(null);
  const [pending, start] = useTransition();
  const total = questions.filter((q) => !SURVEY_TYPES.has(q.type)).reduce((s, q) => s + Number(q.points), 0);

  function move(index: number, dir: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    start(async () => {
      const r = await reorderQuestions(quizId, ids);
      if (!r.ok) toast.error(r.error);
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{questions.length}</strong> soal · total bobot <strong className="text-slate-900">{formatScore(total)}</strong> poin
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setStimOpen(true)}><BookText className="h-4 w-4" /> Stimulus ({stimuli.length})</Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><FileSpreadsheet className="h-4 w-4" /> Impor Excel</Button>
          <Link href={`/print/quizzes/${quizId}`} target="_blank" className={buttonClass("outline", "sm")}><Printer className="h-4 w-4" /> Cetak / PDF</Link>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Tambah soal</Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <EmptyState icon={FileQuestion} title="Belum ada soal" description="Tambahkan soal baru, impor dari Excel, atau salin dari Bank Soal."
          action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setEditing("new")}>Tambah soal pertama</Button><Button variant="outline" onClick={() => setImportOpen(true)}><FileSpreadsheet className="h-4 w-4" /> Impor Excel</Button></div>} />
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id}>
              <Card className="p-4 transition hover:shadow-md sm:p-5">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
                    <button onClick={() => move(i, -1)} disabled={i === 0 || pending} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Naikkan"><ArrowUp className="h-4 w-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === questions.length - 1 || pending} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Turunkan"><ArrowDown className="h-4 w-4" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="violet">{QUESTION_TYPE_LABEL[q.type]}</Badge>
                      <Badge tone="slate">{formatScore(q.points)} poin</Badge>
                      {q.image_path && <Badge tone="accent"><ImageIcon className="h-3 w-3" /> Gambar</Badge>}
                      {q.manual_grading && <Badge tone="amber">Koreksi manual</Badge>}
                      {q.objective_id && objectiveById.get(q.objective_id) && <Badge tone="green"><Target className="h-3 w-3" /> {objectiveById.get(q.objective_id)!.code}</Badge>}
                      {q.stimulus_id && stimById.get(q.stimulus_id) && <Badge tone="brand"><BookText className="h-3 w-3" /> {stimById.get(q.stimulus_id)!.title || "Stimulus"}</Badge>}
                      {q.payload?.hint && <Badge tone="amber"><Lightbulb className="h-3 w-3" /> Petunjuk</Badge>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-800">{q.prompt}</p>
                    {CHOICE.has(q.type) && q.question_options.length > 0 ? (
                      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {q.question_options.map((o, k) => (
                          <li key={o.id} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", o.is_correct ? "bg-emerald-50 font-medium text-emerald-800" : "bg-slate-50 text-slate-600")}>
                            <span className="text-xs font-bold text-slate-400">{String.fromCharCode(65 + k)}</span>
                            <span className="min-w-0 flex-1 truncate">{o.label}</span>
                            {o.is_correct && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">
                        {SURVEY_TYPES.has(q.type) ? "Pilihan: " : "Kunci: "}
                        <span className="font-medium text-emerald-700">{SURVEY_TYPES.has(q.type) ? (q.question_options.map((o) => o.label).join(" · ") || "jawaban bebas") : keySummary(q.type, q.question_options, q.accepted_answers)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start">
                    <Button variant="ghost" size="icon" aria-label="Edit soal" onClick={() => setEditing(q)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Duplikasi soal" disabled={pending}
                      onClick={() => start(async () => { const r = await duplicateQuestion(quizId, q.id); if (r.ok) toast.success(r.message ?? "OK"); else toast.error(r.error); })}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Hapus soal" onClick={() => setDel(q)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Tambah soal" : "Edit soal"} size="lg">
        {editing !== null && (
          <QuestionEditor
            key={editing === "new" ? "new" : editing.id}
            quizId={quizId}
            schoolId={schoolId}
            initial={editing === "new" ? null : editing}
            stimuli={stimuli}
            objectives={objectives}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ImportQuestionsDialog quizId={quizId} open={importOpen} onClose={() => setImportOpen(false)} />
      <StimulusManager quizId={quizId} schoolId={schoolId} stimuli={stimuli} usage={usage} open={stimOpen} onClose={() => setStimOpen(false)} />
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} title="Hapus soal ini?" loading={pending}
        description="Jawaban siswa untuk soal ini juga akan terhapus."
        confirmLabel="Hapus soal"
        onConfirm={() => start(async () => { if (!del) return; const r = await deleteQuestion(quizId, del.id); if (r.ok) { toast.success(r.message ?? "OK"); setDel(null); } else toast.error(r.error); })}
      />
    </>
  );
}
