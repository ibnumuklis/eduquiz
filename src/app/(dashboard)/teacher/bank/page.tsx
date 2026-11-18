import type { Metadata } from "next";
import Link from "next/link";
import { Library, School, User } from "lucide-react";
import { cn } from "@/lib/utils";
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

export default async function BankPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; subject?: string; page?: string; scope?: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { q = "", type = "", subject = "", page: p, scope = "mine" } = await searchParams;
  const schoolScope = scope === "school";
  const { from, to, page } = pageRange(Number(p) || 1, 25);
  const supabase = await createClient();

  let query = supabase
    .from("quiz_questions")
    .select("id, type, prompt, points, created_at, question_options(label, is_correct, match_text, position), accepted_answers, quiz:quizzes!inner(id, title, teacher_id, subject_id, subject:subjects(name))", { count: "exact" })
    .eq("school_id", session.schoolId)
    .eq("quiz.teacher_id", session.userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (type && (QUESTION_TYPES as readonly string[]).includes(type)) query = query.eq("type", type);
  if (subject) query = query.eq("quiz.subject_id", subject);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.ilike("prompt", `%${term}%`);

  const schoolBank = async () => {
    const { data: rows } = await supabase.rpc("get_school_bank", {
      p_school: session.schoolId, p_search: term || null, p_type: (QUESTION_TYPES as readonly string[]).includes(type) ? type : null, p_limit: 150,
    });
    const list = ((rows ?? []) as { id: string; type: string; prompt: string; points: number; accepted_answers: string[]; options: BankQuestion["question_options"]; quiz: { id: string; title: string }; subject: string | null; owner: string | null; objective: string | null }[]);
    const filtered = list.map((r) => ({ id: r.id, type: r.type, prompt: r.prompt, points: Number(r.points), accepted_answers: r.accepted_answers ?? [],
      question_options: r.options, quiz: { id: r.quiz.id, title: r.quiz.title, subject: r.subject ? { name: r.subject } : null }, owner: r.owner, objective: r.objective }));
    return { data: filtered, count: filtered.length };
  };
  const [{ data, count }, { data: subjects }, { data: quizzes }] = await Promise.all([
    schoolScope ? schoolBank() : query,
    supabase.from("subjects").select("id, name").eq("school_id", session.schoolId).order("name"),
    supabase.from("quizzes").select("id, title, status").eq("school_id", session.schoolId).eq("teacher_id", session.userId).order("updated_at", { ascending: false }).limit(100),
  ]);

  return (
    <>
      <PageHeader title="Bank Soal" description="Soal dari kuis Anda dan soal yang dibagikan guru lain di sekolah — salin ke kuis mana pun dengan sekali klik" />
      <Card>
        <div className="flex gap-1 border-b border-slate-100 px-4 pt-3" role="tablist">
          {[{ key: "mine", label: "Soal saya", icon: User }, { key: "school", label: "Bank sekolah", icon: School }].map((t) => (
            <Link key={t.key} role="tab" aria-selected={scope === t.key || (t.key === "mine" && !schoolScope)}
              href={`/teacher/bank${t.key === "school" ? "?scope=school" : ""}`}
              className={cn("inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
                (t.key === "school") === schoolScope ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          {schoolScope && <input type="hidden" name="scope" value="school" />}
          <Input name="q" defaultValue={q} placeholder="Cari teks soal…" className="max-w-xs" aria-label="Cari soal" />
          <Select name="type" defaultValue={type} className="w-52" aria-label="Tipe soal">
            <option value="">Semua tipe</option>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
          </Select>
          {!schoolScope && (
            <Select name="subject" defaultValue={subject} className="w-48" aria-label="Mata pelajaran">
              <option value="">Semua mapel</option>
              {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <button className={buttonClass("outline")}>Filter</button>
        </form>
        {(data ?? []).length === 0 ? (
          <EmptyState className="m-4" icon={Library} title={schoolScope ? "Belum ada soal yang dibagikan" : "Bank soal kosong"}
            description={schoolScope ? "Guru lain dapat membagikan soalnya lewat Pengaturan kuis → “Bagikan soal ke guru lain di sekolah”." : "Soal yang Anda buat di kuis akan otomatis masuk ke bank soal."} />
        ) : (
          <BankList questions={(data ?? []) as unknown as BankQuestion[]} quizzes={(quizzes ?? []) as { id: string; title: string; status: string }[]} />
        )}
        {!schoolScope && <Pagination page={page} total={count ?? 0} size={25} basePath="/teacher/bank" params={{ q: q || undefined, type: type || undefined, subject: subject || undefined }} />}
      </Card>
    </>
  );
}
