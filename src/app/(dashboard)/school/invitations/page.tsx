import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/feedback";
import { siteUrl } from "@/lib/supabase/env";
import { InvitationForm } from "./invitation-form";
import { InvitationList, type InvitationRow } from "./invitation-list";
import { StudentImport } from "./student-import";

export const metadata: Metadata = { title: "Undangan" };

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const session = await requireSchoolRole("school_admin");
  const { role } = await searchParams;
  const supabase = await createClient();
  const [{ data: invites }, { data: classes }] = await Promise.all([
    supabase
      .from("school_invitations")
      .select("id, code, role, email, full_name, max_uses, used_count, expires_at, revoked_at, created_at, class:classes(name)")
      .eq("school_id", session.schoolId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("classes").select("id, name").eq("school_id", session.schoolId).order("name"),
  ]);

  return (
    <>
      <PageHeader title="Undangan & Onboarding" description="Undang guru dan siswa dengan kode aman — setiap orang membuat password sendiri" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-6">
          <InvitationForm classes={classes ?? []} defaultRole={role === "teacher" ? "teacher" : "student"} hasMailer={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />
          <StudentImport />
        </div>
        <InvitationList rows={(invites ?? []) as unknown as InvitationRow[]} baseUrl={siteUrl()} />
      </div>
    </>
  );
}
