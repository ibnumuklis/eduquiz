import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Pagination, pageRange } from "@/components/ui/pagination";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { quizState } from "@/lib/utils/quiz";
import { formatDateTime } from "@/lib/utils";
import { QuizRowActions } from "./quiz-row-actions";
import type { Quiz } from "@/types";

export const metadata: Metadata = { title: "Kuis Saya" };

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; scope?: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { q = "", status = "", page: p, scope = "mine" } = await searchParams;
  const { from, to, page } = pageRange(Number(p) || 1);
  const supabase = await createClient();
  let query = supabase
    .from("quizzes")
    .select("*, subject:subjects(name), quiz_questions(count), quiz_results(count), teacher:profiles(full_name)", { count: "exact" })
    .eq("school_id", session.schoolId)
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (scope !== "all" || session.role !== "school_admin") query = query.eq("teacher_id", session.userId);
  if (status && ["draft", "published", "closed"].includes(status)) query = query.eq("status", status);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.ilike("title", `%${term}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as (Quiz & { subject: { name: string } | null; quiz_questions: { count: number }[]; quiz_results: { count: number }[]; teacher: { full_name: string } | null })[];

  return (
    <>
      <PageHeader
        title="Kuis Saya"
        description="Buat, kelola, dan pantau kuis"
        actions={<Link href="/teacher/quizzes/new" className={buttonClass()}><Plus className="h-4 w-4" /> Buat kuis</Link>}
      />
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Input name="q" defaultValue={q} placeholder="Cari judul kuis…" className="max-w-xs" aria-label="Cari kuis" />
          <Select name="status" defaultValue={status} className="w-40" aria-label="Filter status">
            <option value="">Semua status</option><option value="draft">Draft</option><option value="published">Dipublikasikan</option><option value="closed">Ditutup</option>
          </Select>
          {session.role === "school_admin" && (
            <Select name="scope" defaultValue={scope} className="w-48" aria-label="Cakupan">
              <option value="mine">Kuis saya</option><option value="all">Semua kuis sekolah</option>
            </Select>
          )}
          <button className={buttonClass("outline")}>Terapkan</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState className="m-4" icon={ClipboardList} title="Belum ada kuis" description="Mulai dengan membuat kuis pertama Anda." action={<Link href="/teacher/quizzes/new" className={buttonClass()}>Buat kuis</Link>} />
        ) : (
          <Table>
            <THead><tr><TH>Kuis</TH><TH>Status</TH><TH>Soal</TH><TH>Pengumpulan</TH><TH>Jadwal</TH><TH className="text-right">Aksi</TH></tr></THead>
            <tbody>
              {rows.map((r) => {
                const st = quizState(r);
                return (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/teacher/quizzes/${r.id}`} className="font-semibold text-slate-800 hover:text-brand-600">{r.title}</Link>
                      <p className="text-xs text-slate-500">
                        {r.subject?.name ?? "Tanpa mapel"} · Kode <span className="font-mono font-semibold">{r.access_code}</span>
                        {r.teacher_id !== session.userId && r.teacher ? ` · ${r.teacher.full_name}` : ""}
                      </p>
                    </TD>
                    <TD><Badge tone={st.tone}>{st.label}</Badge></TD>
                    <TD>{r.quiz_questions?.[0]?.count ?? 0}</TD>
                    <TD>{r.quiz_results?.[0]?.count ?? 0}</TD>
                    <TD className="text-xs text-slate-500">{r.start_at || r.end_at ? <>{formatDateTime(r.start_at, session.timezone)}<br />s/d {formatDateTime(r.end_at, session.timezone)}</> : "Tanpa jadwal"}</TD>
                    <TD className="text-right"><QuizRowActions id={r.id} title={r.title} status={r.status} /></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} total={count ?? 0} basePath="/teacher/quizzes" params={{ q: q || undefined, status: status || undefined, scope }} />
      </Card>
    </>
  );
}
