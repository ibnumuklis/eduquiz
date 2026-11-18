import type { Metadata } from "next";
import { BarChart3, Grid3x3, MessageSquareQuote, Target, Vote } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz } from "@/features/quizzes/queries";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { QUESTION_TYPE_LABEL, SURVEY_TYPES, type QuestionTypeValue } from "@/lib/validations/quiz";
import {
  cellTone, difficultyLabel, discriminationIndex, discriminationLabel, objectiveMastery, raporDescription, type QuizAnalysis,
} from "@/lib/utils/analysis";
import { cn, formatScore } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Analisis Kuis" };

const CHOICE = new Set(["multiple_choice", "multiple_select", "true_false"]);

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSchoolRole("teacher");
  const { id } = await params;
  const quiz = await getManagedQuiz(id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_quiz_analysis", { p_quiz: id });
  if (error || !data) return <Alert tone="error">Analisis tidak dapat dimuat.</Alert>;
  const a = data as QuizAnalysis;
  if (!a.students.length) return <EmptyState icon={BarChart3} title="Belum ada data" description="Analisis muncul setelah siswa mengumpulkan kuis." />;

  const scored = a.questions.filter((q) => !SURVEY_TYPES.has(q.type));
  const surveys = a.questions.filter((q) => SURVEY_TYPES.has(q.type) || (q.type !== "essay" && q.words && q.words.length > 0 && !CHOICE.has(q.type)));
  const threshold = Number(quiz.mode === "practice" ? quiz.mastery_target : quiz.passing_grade);
  const masteryByStudent = new Map(a.students.map((s) => [s.student_id, objectiveMastery(s, scored, a.objectives)]));
  const classAvg = (objId: string) => {
    const vals = a.students.map((s) => masteryByStudent.get(s.student_id)?.[objId]).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
  };
  const hardest = [...scored].filter((q) => q.p_value !== null).sort((x, y) => Number(x.p_value) - Number(y.p_value))[0];

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 text-sm">
        {[["#heatmap", "Heatmap"], ["#butir", "Analisis butir"], ["#tp", "Ketuntasan TP"], ["#rapor", "Draf rapor"], ...(surveys.length ? [["#survei", "Survei & jawaban"]] : [])].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700">{label}</a>
        ))}
      </nav>

      {hardest && (
        <Alert tone="info" title="Soal paling sulit">
          Soal no. {hardest.no} hanya dikuasai {Math.round(Number(hardest.p_value) * 100)}% siswa. Pertimbangkan pembahasan ulang di kelas.
        </Alert>
      )}

      <Card id="heatmap">
        <CardHeader title={<span className="inline-flex items-center gap-2"><Grid3x3 className="h-5 w-5 text-brand-500" /> Heatmap siswa × soal</span>}
          description={quiz.mode === "practice" ? "Nilai terbaik per soal dari seluruh latihan" : "Berdasarkan pengumpulan terakhir setiap siswa"} />
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-600">Siswa</th>
                {scored.map((q) => <th key={q.id} title={q.prompt} className="px-1 py-2 text-center font-semibold text-slate-500">{q.no}</th>)}
                <th className="px-3 py-2 text-right font-semibold text-slate-600">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {a.students.map((s) => (
                <tr key={s.student_id}>
                  <td className="sticky left-0 z-10 max-w-48 truncate border-t border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-800">
                    {s.name}{s.integrity_count > 0 && <span className="ml-1 text-amber-600" title="Catatan integritas">⚑{s.integrity_count}</span>}
                  </td>
                  {scored.map((q) => {
                    const v = s.cells[q.id];
                    return (
                      <td key={q.id} className="border-t border-slate-100 p-0.5">
                        <span className={cn("grid h-7 min-w-7 place-items-center rounded font-semibold", cellTone(v))}
                          title={v === -2 ? "Menunggu koreksi" : v === -1 ? "Tidak dijawab" : v === null || v === undefined ? "Tidak disajikan" : `${Math.round(v * 100)}%`}>
                          {v === -2 ? "?" : v === -1 ? "–" : v === null || v === undefined ? "" : v >= 1 ? "✓" : v > 0 ? Math.round(v * 100) : "✗"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-t border-slate-100 px-3 py-1.5 text-right font-bold text-brand-700">{s.score !== null ? formatScore(s.score) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          {[["bg-emerald-500", "Benar"], ["bg-emerald-200", "≥50%"], ["bg-amber-200", "Sebagian"], ["bg-rose-400", "Salah"], ["bg-slate-200", "Kosong"], ["bg-amber-100", "Menunggu koreksi"]].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded", c)} />{l}</span>
          ))}
        </div>
      </Card>

      <Card id="butir">
        <CardHeader title={<span className="inline-flex items-center gap-2"><BarChart3 className="h-5 w-5 text-violet-500" /> Analisis butir soal</span>}
          description="Tingkat kesukaran (p) dan daya beda (D, kelompok atas–bawah 27%). Pengecoh yang tidak dipilih siapa pun perlu diganti." />
        <CardBody className="space-y-4">
          {scored.map((q) => {
            const diff = difficultyLabel(q.p_value);
            const d = discriminationIndex(a.students, q.id);
            const disc = discriminationLabel(d);
            const total = q.options.reduce((s, o) => s + o.count, 0);
            const objective = a.objectives.find((o) => o.id === q.objective_id);
            return (
              <div key={q.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{q.no}</span>
                  <Badge tone="violet">{QUESTION_TYPE_LABEL[q.type as QuestionTypeValue] ?? q.type}</Badge>
                  {objective && <Badge tone="green"><Target className="h-3 w-3" /> {objective.code}</Badge>}
                  <Badge tone={diff.tone}>p = {q.p_value === null ? "—" : Number(q.p_value).toFixed(2)} · {diff.label}</Badge>
                  <Badge tone={disc.tone}>D = {d === null ? "—" : d.toFixed(2)} · {disc.label}</Badge>
                  <span className="text-xs text-slate-500">{q.responses} respon</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-700">{q.prompt}</p>
                {CHOICE.has(q.type) && total > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((o, i) => {
                      const pct = Math.round((o.count / total) * 100);
                      return (
                        <li key={o.id} className="grid grid-cols-[1.5rem_1fr_3rem] items-center gap-2 text-xs">
                          <span className="font-bold text-slate-400">{String.fromCharCode(65 + i)}</span>
                          <div className="relative h-6 overflow-hidden rounded-lg bg-slate-100">
                            <div className={cn("absolute inset-y-0 left-0", o.is_correct ? "bg-emerald-400" : "bg-rose-300")} style={{ width: `${pct}%` }} />
                            <span className="relative z-10 flex h-full items-center px-2 text-slate-800">
                              {o.label}{!o.is_correct && o.count === 0 && <span className="ml-2 text-amber-700">· pengecoh tidak berfungsi</span>}
                            </span>
                          </div>
                          <span className="text-right font-semibold text-slate-600">{pct}%</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card id="tp">
        <CardHeader title={<span className="inline-flex items-center gap-2"><Target className="h-5 w-5 text-emerald-500" /> Ketuntasan per Tujuan Pembelajaran</span>}
          description={`Tuntas bila ≥ ${formatScore(threshold)}%. Tautkan soal ke TP di editor soal agar tabel ini terisi.`} />
        {a.objectives.length === 0 ? (
          <CardBody><EmptyState icon={Target} title="Belum ada soal yang ditautkan ke TP" description="Tambahkan TP di menu TP / CP, lalu pilih TP pada setiap soal." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-600">
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Siswa</th>
                  {a.objectives.map((o) => <th key={o.id} title={o.description} className="px-3 py-2 text-center font-semibold">{o.code}</th>)}
                </tr>
              </thead>
              <tbody>
                {a.students.map((s) => {
                  const m = masteryByStudent.get(s.student_id) ?? {};
                  return (
                    <tr key={s.student_id} className="border-t border-slate-100">
                      <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-800">{s.name}</td>
                      {a.objectives.map((o) => {
                        const v = m[o.id];
                        return (
                          <td key={o.id} className="px-3 py-2 text-center">
                            {v === null || v === undefined ? <span className="text-slate-300">—</span>
                              : <span className={cn("rounded-lg px-2 py-0.5 text-xs font-bold", v >= threshold ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{v}%</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="sticky left-0 bg-slate-50 px-3 py-2">Rata-rata kelas</td>
                  {a.objectives.map((o) => { const v = classAvg(o.id); return <td key={o.id} className="px-3 py-2 text-center">{v === null ? "—" : `${v}%`}</td>; })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="rapor">
        <CardHeader title={<span className="inline-flex items-center gap-2"><MessageSquareQuote className="h-5 w-5 text-accent-500" /> Draf deskripsi capaian (rapor)</span>}
          description="Disusun otomatis dari ketuntasan per TP. Periksa dan sesuaikan sebelum dipakai di rapor." />
        <CardBody>
          {a.objectives.length === 0 ? (
            <p className="text-sm text-slate-500">Tautkan soal ke TP untuk menghasilkan draf deskripsi.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {a.students.map((s) => {
                const text = raporDescription(s.name, masteryByStudent.get(s.student_id) ?? {}, a.objectives, threshold);
                return (
                  <li key={s.student_id} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{s.name}{s.student_number ? <span className="ml-2 text-xs font-normal text-slate-500">NIS {s.student_number}</span> : null}</p>
                      <p className="mt-1 text-sm text-slate-600">{text}</p>
                    </div>
                    <CopyButton text={text} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {surveys.length > 0 && (
        <Card id="survei">
          <CardHeader title={<span className="inline-flex items-center gap-2"><Vote className="h-5 w-5 text-violet-500" /> Survei & jawaban terbanyak</span>} />
          <CardBody className="grid gap-4 lg:grid-cols-2">
            {surveys.map((q) => {
              const total = q.options.reduce((s, o) => s + o.count, 0);
              const max = Math.max(1, ...(q.words ?? []).map((w) => w.count));
              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500">Soal {q.no} · {QUESTION_TYPE_LABEL[q.type as QuestionTypeValue]}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{q.prompt}</p>
                  {q.type === "poll" ? (
                    <ul className="mt-3 space-y-2">
                      {q.options.map((o) => {
                        const pct = total ? Math.round((o.count / total) * 100) : 0;
                        return (
                          <li key={o.id} className="text-xs">
                            <div className="mb-1 flex justify-between"><span>{o.label}</span><span className="font-semibold">{o.count} ({pct}%)</span></div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-4">
                      {(q.words ?? []).length === 0 ? <span className="text-sm text-slate-400">Belum ada jawaban</span> : (q.words ?? []).map((w, i) => (
                        <span key={w.text} title={`${w.count} siswa`} className={cn("font-bold leading-tight", ["text-brand-600", "text-violet-600", "text-accent-600", "text-emerald-600", "text-amber-600"][i % 5])}
                          style={{ fontSize: `${0.8 + (w.count / max) * 1.6}rem` }}>{w.text}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
