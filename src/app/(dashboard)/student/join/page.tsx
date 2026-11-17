import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Gabung Kuis" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireSchoolRole("student");
  const { code } = await searchParams;
  return (
    <div className="mx-auto max-w-md py-6">
      <JoinForm defaultCode={code?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)} />
    </div>
  );
}
