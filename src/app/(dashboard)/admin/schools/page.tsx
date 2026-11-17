import type { Metadata } from "next";
import { requireRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { SchoolsTable, type PlatformSchool } from "./schools-table";

export const metadata: Metadata = { title: "Manajemen Sekolah" };

export default async function AdminSchoolsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_schools");
  if (error) throw new Error(error.message);
  return (
    <>
      <PageHeader title="Manajemen Sekolah" description="Aktifkan/nonaktifkan sekolah dan tetapkan administrator" />
      <SchoolsTable rows={(data ?? []) as PlatformSchool[]} />
    </>
  );
}
