import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Membership, Profile } from "@/types";

export const ACTIVE_SCHOOL_COOKIE = "eq_school";

export interface SessionContext {
  userId: string;
  email: string;
  emailVerified: boolean;
  profile: Profile;
  memberships: Membership[];
  activeMembership: Membership | null;
  role: AppRole | null;
  isSuperAdmin: boolean;
  schoolId: string | null;
  timezone: string;
}

/** Loads the signed-in user, memberships and active school (cached per request). */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("school_members")
      .select("id, school_id, role, status, student_number, school:schools(id, name, status, timezone, slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at"),
  ]);
  if (!profile) return null;

  const memberships = ((members ?? []) as unknown as Membership[]).filter((m) => m.school);
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
  const activeMembership =
    memberships.find((m) => m.school_id === preferred && m.school.status === "active") ??
    memberships.find((m) => m.school.status === "active") ??
    null;

  const isSuperAdmin = Boolean((profile as Profile).is_super_admin);
  return {
    userId: user.id,
    email: user.email ?? "",
    emailVerified: Boolean(user.email_confirmed_at),
    profile: profile as Profile,
    memberships,
    activeMembership,
    role: activeMembership?.role ?? (isSuperAdmin ? "super_admin" : null),
    isSuperAdmin,
    schoolId: activeMembership?.school_id ?? null,
    timezone: activeMembership?.school.timezone ?? "Asia/Jakarta",
  };
});

export function homeForRole(role: AppRole | null) {
  switch (role) {
    case "super_admin":
      return "/admin";
    case "school_admin":
      return "/school";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    default:
      return "/onboarding";
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Server-side route guard. RLS still enforces data access independently. */
export async function requireRole(...roles: AppRole[]) {
  const session = await requireSession();
  const allowed =
    (session.role && roles.includes(session.role)) ||
    (roles.includes("super_admin") && session.isSuperAdmin) ||
    // school admins can use every teacher tool
    (roles.includes("teacher") && session.role === "school_admin");
  if (!allowed) redirect(homeForRole(session.role));
  return session;
}

/** Same as requireRole but guarantees an active school context. */
export async function requireSchoolRole(...roles: AppRole[]) {
  const session = await requireRole(...roles);
  if (!session.schoolId || !session.activeMembership) redirect("/onboarding");
  return session as SessionContext & { schoolId: string; activeMembership: Membership };
}
