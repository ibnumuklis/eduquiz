import type { Metadata } from "next";
import { requireSession } from "@/lib/permissions/session";
import { PageHeader } from "@/components/ui/feedback";
import { ProfileForms } from "./profile-forms";

export const metadata: Metadata = { title: "Profil & Keamanan" };

export default async function ProfilePage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader title="Profil & Keamanan" description="Kelola informasi akun dan password Anda" />
      <ProfileForms
        fullName={session.profile.full_name}
        phone={session.profile.phone ?? ""}
        email={session.email}
        memberships={session.memberships.map((m) => ({ school: m.school.name, role: m.role }))}
        role={session.role}
      />
    </>
  );
}
