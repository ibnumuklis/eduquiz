import { redirect } from "next/navigation";
import { homeForRole, requireSession } from "@/lib/permissions/session";

export default async function DashboardRedirect() {
  const session = await requireSession();
  redirect(homeForRole(session.role));
}
