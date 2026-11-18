import type { Metadata } from "next";
import { FileBarChart2, Target } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { raporDescription, type AnalysisObjective } from "@/lib/utils/analysis";
import { cn, formatScore } from "@/lib/utils";
import { PdfButton } from "@/components/pdf-button";
import { CsvButton } from "@/components/csv-button";
import { CopyButton } from "@/app/(dashboard)/teacher/quizzes/[id]/analysis/copy-button";
import { safeFilename, type PdfSpec } from "@/lib/pdf/report";

export const metadata: Metadata = { title: "Rapor TP" };

interface Mastery {
  class: { id: string; name: string };
  quizzes: { id: string; title: string; mode: string; date: string }[];
  objectives: AnalysisObjective[];
  students: { student_id: string; name: string; student_number: string | null; quizzes_done: number; avg_score: number | null; mastery: Record<string, number> }[];
}

function semester(now = new Date()) {
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? { from: `${y}-07-01`, to: `${y}-12-31` } : { from: `${y}-01-01`, to: `${y}-06-30` };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ class?: string; subject?: string; from?: string; to?: string; kkm?: string }> }) {
  const session = await requireSchoolRole("teacher");
  const sp = await searchParams;
  const sem = semester();
  const from = sp.from || sem.from, to = sp.to || sem.to;
  const kkm = Math.min(100, Math.max(0, Number(sp.kkm) || 75));
  const supabase = await createClient();
  const isAdmin = session.role === "school_admin";

  const [{ data: classRows }, { data: subjects }, { data: taught }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("school_id", session.schoolId).order("name"),
    supabase.from("subjects").select("id, name").eq("school_id", session.schoolId).order("name"),
    supabase.from("teacher_subjects").select("class_id").eq("school_id", session.schoolId).eq("teacher_id", session.userId),
  ]);
  const taughtIds = new Set((taught ?? []).map((t) => t.class_id as string));
  const classes = (classRows ?? []).filter((c) => isAdmin || taughtIds.has(c.id)) as { id: string; name: string }[];
  const classId = sp.class && classes.some((c) => c.id === sp.class) ? sp.class : classes[0]?.id;
  const subjectId = sp.subject && (subjects ?? []).some((s) => s.id === sp.subject) ? sp.subject : "";

  let data: Mastery | null = null;
  let error: string | null = null;
  if (classId) {
    const res = await supabase.rpc("get_class_mastery", { p_class: classId, p_subject: subjectId || null, p_from: from, p_to: to });
    if (res.error) error = res.error.message; else data = res.data as Mastery;
  }
  const subjectName = (subjects ?? []).find((s) => s.id === subjectId)?.name;

  const descriptions = data ? data.students.map((s) => ({ s, text: raporDescription(s.name, s.mastery, data!.objectives, kkm) })) : [];
  const head = data ? ["Nama", "NIS", "Kuis dikerjakan", "Rata-rata nilai", ...data.objectives.map((o) => o.code)] : [];
  const rows = data ? data.students.map((s) => [s.name, s.student_number ?? "", s.quizzes_done, s.avg_score === null ? null : formatScore(s.avg_score), ...data!.objectives.map((o) => s.mastery[o.id] ?? null)]) : [];
  const pdf: PdfSpec | null = data ? {
    filename: `rapor-tp-${safeFilename(data.class.name)}${subjectName ? `-${safeFilename(subjectName)}` : ""}`,
    title: `Rekap Ketuntasan Tujuan Pembelajaran — ${data.class.name}`,
    subtitle: subjectName ? `Mata pelajaran ${subjectName}` : "Semua mata pelajaran",
    school: session.activeMembership?.school.name,
    landscape: data.objectives.length > 4,
    meta: [["Periode", `${from} s.d. ${to}`], ["Kuis", String(data.quizzes.length)], ["Siswa", String(data.students.length)], ["Batas tuntas", `${kkm}%`]],
    sections: [
      { heading: "Ketuntasan per TP (%)", note: data.objectives.map((o) => `${o.code}: ${o.description}`).join(" · "), head, body: rows },
      { heading: "Draf deskripsi capaian kompetensi", items: descriptions.map(({ s, text }) => ({ title: `${s.name}${s.student_number ? ` (NIS ${s.student_number})` : ""}`, text })) },
      { heading: "Kuis yang dihitung", head: ["Tanggal", "Judul", "Mode"], body: data.quizzes.map((q) => [new Date(q.date).toLocaleDateString("id-ID"), q.title, q.mode]) },
    ],
  } : null;

  return (
    <>
      <PageHeader title="Rapor TP" description="Rekap ketuntasan Tujuan Pembelajaran lintas kuis untuk satu kelas dan periode, lengkap dengan draf deskripsi rapor Kurikulum Merdeka." />
      <Card className="mb-6">
        <CardBody>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_160px_160px_110px_auto] md:items-end">
            <Field label="Kelas" htmlFor="class">
              <Select id="class" name="class" defaultValue={classId}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Mata pelajaran" htmlFor="subject">
              <Select id="subject" name="subject" defaultValue={subjectId}>
                <option value="">Semua mapel</option>
                {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Dari" htmlFor="from"><Input id="from" name="from" type="date" defaultValue={from} /></Field>
            <Field label="Sampai" htmlFor="to"><Input id="to" name="to" type="date" defaultValue={to} /></Field>
            <Field label="Batas tuntas" htmlFor="kkm"><Input id="kkm" name="kkm" type="number" min={0} max={100} defaultValue={kkm} /></Field>
            <button className={buttonClass("primary")}>Tampilkan</button>
          </form>
        </CardBody>
      </Card>

      {!classes.length ? (
        <EmptyState icon={FileBarChart2} title="Belum ada kelas yang Anda ajar" description="Minta admin sekolah menugaskan Anda ke kelas di menu Guru & Staf." />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : !data || !data.quizzes.length ? (
        <EmptyState icon={FileBarChart2} title="Belum ada kuis pada periode ini" description="Kuis yang ditugaskan ke kelas ini dan sudah dipublikasikan pada periode terpilih akan dihitung." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-600">{data.quizzes.length} kuis · {data.students.length} siswa · {data.objectives.length} TP</p>
            <div className="ml-auto flex gap-2">
              {pdf && <PdfButton spec={pdf} variant="primary" label="Unduh PDF rapor" />}
              <CsvButton filename={pdf?.filename ?? "rapor-tp"} head={head} rows={rows} />
            </div>
          </div>
          {!data.objectives.length && (
            <Alert tone="warning" title="Soal belum ditautkan ke TP">Tautkan soal-soal kuis ke TP (menu TP / CP lalu pilih TP di editor soal) agar ketuntasan per TP dan deskripsi rapor dapat dihitung.</Alert>
          )}
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Target className="h-5 w-5 text-emerald-500" /> Ketuntasan per TP</span>}
              description={`Tuntas bila ≥ ${kkm}%. Latihan dihitung dari nilai terbaik per soal; kuis lain dari pengumpulan terakhir.`} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600">
                    <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Siswa</th>
                    <th className="px-3 py-2">Kuis</th><th className="px-3 py-2">Rata-rata</th>
                    {data.objectives.map((o) => <th key={o.id} title={o.description} className="px-3 py-2 text-center font-semibold">{o.code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.student_id} className="border-t border-slate-100">
                      <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-800">{s.name}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{s.quizzes_done}/{data!.quizzes.length}</td>
                      <td className="px-3 py-2 text-center font-semibold text-brand-700">{s.avg_score === null ? "—" : formatScore(s.avg_score)}</td>
                      {data!.objectives.map((o) => {
                        const v = s.mastery[o.id];
                        return (
                          <td key={o.id} className="px-3 py-2 text-center">
                            {v === undefined ? <span className="text-slate-300">—</span>
                              : <span className={cn("rounded-lg px-2 py-0.5 text-xs font-bold", v >= kkm ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{v}%</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {data.objectives.length > 0 && (
            <Card>
              <CardHeader title="Draf deskripsi capaian (rapor)" description="Disusun otomatis dari ketuntasan per TP. Periksa dan sesuaikan sebelum dipakai di rapor." />
              <CardBody>
                <ul className="divide-y divide-slate-100">
                  {descriptions.map(({ s, text }) => (
                    <li key={s.student_id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{text}</p>
                      </div>
                      <CopyButton text={text} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
