import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Pagination, pageRange } from "@/components/ui/pagination";
import { StudentsTable, type StudentRow } from "./students-table";

export const metadata: Metadata = { title: "Siswa" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await requireSchoolRole("school_admin");
  const { q = "", page: pageParam } = await searchParams;
  const { from, to, page } = pageRange(Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("school_members")
    .select("id, user_id, status, student_number, created_at, profile:profiles!inner(full_name, email)", { count: "exact" })
    .eq("school_id", session.schoolId)
    .eq("role", "student")
    .order("created_at", { ascending: false })
    .range(from, to);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`, { referencedTable: "profiles" });
  const { data, count } = await query;

  const rows = (data ?? []) as unknown as Omit<StudentRow, "classes">[];
  const ids = rows.map((r) => r.user_id);
  const { data: cls } = ids.length
    ? await supabase.from("class_students").select("student_id, class:classes(name)").in("student_id", ids).eq("school_id", session.schoolId)
    : { data: [] };
  const classMap = new Map<string, string[]>();
  ((cls ?? []) as unknown as { student_id: string; class: { name: string } }[]).forEach((c) =>
    classMap.set(c.student_id, [...(classMap.get(c.student_id) ?? []), c.class?.name]),
  );

  return (
    <>
      <PageHeader
        title="Siswa"
        description="Siswa bergabung melalui undangan — tidak ada password bersama"
        actions={
          <>
            <Link href="/school/invitations#import" className={buttonClass("outline")}><Upload className="h-4 w-4" /> Impor CSV</Link>
            <Link href="/school/invitations?role=student" className={buttonClass()}>Undang siswa</Link>
          </>
        }
      />
      <Card>
        <form className="border-b border-slate-100 p-4">
          <Input name="q" defaultValue={q} placeholder="Cari nama atau email siswa…" className="max-w-sm" aria-label="Cari siswa" />
        </form>
        <StudentsTable rows={rows.map((r) => ({ ...r, classes: classMap.get(r.user_id) ?? [] }))} />
        <Pagination page={page} total={count ?? 0} basePath="/school/students" params={{ q: q || undefined }} />
      </Card>
    </>
  );
}
