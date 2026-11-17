import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { QuizSettingsForm } from "@/components/quiz/quiz-settings-form";
import { createQuiz } from "@/features/quizzes/actions";

export const metadata: Metadata = { title: "Buat Kuis" };

export default async function NewQuizPage() {
  const session = await requireSchoolRole("teacher");
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("school_id", session.schoolId).order("name");
  return (
    <>
      <PageHeader
        back={<Link href="/teacher/quizzes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"><ArrowLeft className="h-4 w-4" /> Kuis saya</Link>}
        title="Buat kuis baru"
        description="Atur informasi dasar. Anda bisa menambahkan soal setelah kuis tersimpan sebagai draft."
      />
      <QuizSettingsForm action={createQuiz} subjects={subjects ?? []} timezone={session.timezone} submitLabel="Simpan & lanjut tambah soal" />
    </>
  );
}
