import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { getSchoolObjectives } from "@/features/quizzes/queries";
import { PageHeader } from "@/components/ui/feedback";
import { ObjectivesManager } from "./objectives-manager";

export const metadata: Metadata = { title: "Tujuan Pembelajaran (TP)" };

export default async function ObjectivesPage() {
  const session = await requireSchoolRole("teacher");
  const supabase = await createClient();
  const [objectives, { data: subjects }] = await Promise.all([
    getSchoolObjectives(session.schoolId),
    supabase.from("subjects").select("id, name").eq("school_id", session.schoolId).order("name"),
  ]);
  return (
    <>
      <PageHeader title="Tujuan Pembelajaran (TP / CP)" description="Daftar TP Kurikulum Merdeka sekolah. Tautkan ke soal untuk laporan ketuntasan per TP dan draf deskripsi rapor." />
      <ObjectivesManager objectives={objectives} subjects={subjects ?? []} userId={session.userId} isAdmin={session.role === "school_admin"} />
    </>
  );
}
