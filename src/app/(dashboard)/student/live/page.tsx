import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { LiveJoinForm } from "./live-join-form";

export const metadata: Metadata = { title: "Gabung Live" };

export default async function LiveJoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireSchoolRole("student");
  const { code } = await searchParams;
  return <div className="mx-auto max-w-md py-6"><LiveJoinForm defaultCode={code?.replace(/\D/g, "").slice(0, 6)} /></div>;
}
