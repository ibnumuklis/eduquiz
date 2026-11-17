import type { Metadata } from "next";
import { requireRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Pagination, pageRange } from "@/components/ui/pagination";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { activityLabel } from "@/features/reports/activity-labels";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireRole("super_admin");
  const { from, to, page } = pageRange(Number((await searchParams).page) || 1, 40);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, actor:profiles(full_name, email), school:schools(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  const rows = (data ?? []) as unknown as { id: string; action: string; entity_type: string | null; metadata: Record<string, unknown>; created_at: string; actor: { full_name: string; email: string } | null; school: { name: string } | null }[];
  return (
    <>
      <PageHeader title="Audit Log" description="Seluruh aktivitas penting lintas sekolah" />
      <Card>
        {rows.length === 0 ? <EmptyState className="m-4" title="Belum ada log" /> : (
          <Table>
            <THead><tr><TH>Waktu</TH><TH>Sekolah</TH><TH>Pengguna</TH><TH>Aksi</TH><TH>Detail</TH></tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.created_at)}</TD>
                  <TD>{r.school?.name ?? "Platform"}</TD>
                  <TD><p className="text-sm">{r.actor?.full_name ?? "Sistem"}</p><p className="text-xs text-slate-400">{r.actor?.email}</p></TD>
                  <TD><Badge tone="brand">{activityLabel(r.action)}</Badge></TD>
                  <TD className="max-w-sm truncate text-xs text-slate-500">{JSON.stringify(r.metadata)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} total={count ?? 0} size={40} basePath="/admin/audit" />
      </Card>
    </>
  );
}
