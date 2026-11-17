import type { Metadata } from "next";
import { Library } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Pagination, pageRange } from "@/components/ui/pagination";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "@/lib/validations/quiz";
import { BankList, type BankQuestion } from "./bank-list";

export const metadata: Metadata = { title: "Bank Soal" };

export default async function BankPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; subject?: string; page?: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { q = "", type = "", subject = "", page: p } = await searchParams;
  const { from, to, page } = pageRange(Number(p) || 1, 25);
  const supabase = await createClient();

  let query = supabase
    .from("quiz_questions")
    .select("id, type, prompt, points, created_at, question_options(label, is_correct, position), accepted_answers, quiz:quizzes!inner(id, title, teacher_id, subject_id, subject:subjects(name))", { count: "exact" })
    .eq("school_id", session.schoolId)
    .eq("quiz.teacher_id", session.userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (type && (QUESTION_TYPES as readonly string[]).includes(type)) query = query.eq("type", type);
  if (subject) query = query.eq("quiz.subject_id", subject);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.ilike("prompt", `%${term}%`);

  const [{ data, count }, { data: subjects }, { data: quizzes }] = await Promise.all([
    query,
    supabase.from("subjects").select("id, name").eq("school_id", session.schoolId).order("name"),
    supabase.from("quizzes").select("id, title, status").eq("school_id", session.schoolId).eq("teacher_id", session.userId).order("updated_at", { ascending: false }).limit(100),
  ]);

  return (
    <>
      <PageHeader title="Bank Soal" description="Semua soal dari kuis Anda — salin ke kuis lain dengan sekali klik" />
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Input name="q" defaultValue={q} placeholder="Cari teks soal…" className="max-w-xs" aria-label="Cari soal" />
          <Select name="type" defaultValue={type} className="w-52" aria-label="Tipe soal">
            <option value="">Semua tipe</option>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
          </Select>
          <Select name="subject" defaultValue={subject} className="w-48" aria-label="Mata pelajaran">
            <option value="">Semua mapel</option>
            {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <button className={buttonClass("outline")}>Filter</button>
        </form>
        {(data ?? []).length === 0 ? (
          <EmptyState className="m-4" icon={Library} title="Bank soal kosong" description="Soal yang Anda buat di kuis akan otomatis masuk ke bank soal." />
        ) : (
          <BankList questions={(data ?? []) as unknown as BankQuestion[]} quizzes={(quizzes ?? []) as { id: string; title: string; status: string }[]} />
        )}
        <Pagination page={page} total={count ?? 0} size={25} basePath="/teacher/bank" params={{ q: q || undefined, type: type || undefined, subject: subject || undefined }} />
      </Card>
    </>
  );
}
