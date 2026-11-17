import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession, type SessionContext } from "./session";
import type { AppRole } from "@/types";

export class ActionError extends Error {}

/**
 * Authorization gate for Server Actions. This is a first line of defence that
 * gives friendly errors; the database (RLS + RPC checks) is the real boundary.
 */
export async function authorize(...roles: AppRole[]): Promise<{
  session: SessionContext & { schoolId: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const session = await getSession();
  if (!session) throw new ActionError("Sesi berakhir, silakan login ulang");
  const ok =
    roles.length === 0 ||
    (session.role && roles.includes(session.role)) ||
    (roles.includes("teacher") && session.role === "school_admin") ||
    (roles.includes("super_admin") && session.isSuperAdmin);
  if (!ok) throw new ActionError("Anda tidak memiliki akses untuk tindakan ini");
  if (!roles.includes("super_admin") && !session.schoolId) throw new ActionError("Pilih sekolah terlebih dahulu");
  return { session: session as SessionContext & { schoolId: string }, supabase: await createClient() };
}

export function actionErrorMessage(e: unknown) {
  if (e instanceof ActionError) return e.message;
  console.error(e);
  return "Terjadi kesalahan pada server. Silakan coba lagi.";
}
