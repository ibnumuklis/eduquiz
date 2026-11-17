import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { SettingsForm } from "./settings-form";
import type { School } from "@/types";

export const metadata: Metadata = { title: "Pengaturan Sekolah" };

export default async function SchoolSettingsPage() {
  const session = await requireSchoolRole("school_admin");
  const supabase = await createClient();
  const { data } = await supabase.from("schools").select("*").eq("id", session.schoolId).single();
  return (
    <>
      <PageHeader title="Pengaturan Sekolah" description="Profil sekolah, tahun ajaran, dan privasi leaderboard" />
      <SettingsForm school={data as School} />
    </>
  );
}
