import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { requireSession } from "@/lib/permissions/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.role) redirect("/onboarding");
  return (
    <DashboardShell
      userId={session.userId}
      name={session.profile.full_name || session.email}
      email={session.email}
      role={session.role}
      isSuperAdmin={session.isSuperAdmin}
      schoolId={session.schoolId}
      schools={session.memberships
        .filter((m) => m.school.status === "active")
        .map((m) => ({ id: m.school_id, name: m.school.name, role: m.role }))}
    >
      {children}
    </DashboardShell>
  );
}
