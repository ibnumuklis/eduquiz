import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { Pagination, pageRange } from "@/components/ui/pagination";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { activityLabel } from "@/features/reports/activity-labels";

export const metadata: Metadata = { title: "Aktivitas Sekolah" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSchoolRole("school_admin");
  const { from, to, page } = pageRange(Number((await searchParams).page) || 1, 30);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, metadata, created_at, actor:profiles(full_name)", { count: "exact" })
    .eq("school_id", session.schoolId)
    .order("created_at", { ascending: false })
    .range(from, to);
  const rows = (data ?? []) as unknown as { id: string; action: string; metadata: Record<string, unknown>; created_at: string; actor: { full_name: string } | null }[];
  return (
    <>
      <PageHeader title="Aktivitas Sekolah" description="Jejak audit seluruh aktivitas penting di sekolah" />
      <Card>
        {rows.length === 0 ? <EmptyState className="m-4" title="Belum ada aktivitas" /> : (
          <Table>
            <THead><tr><TH>Waktu</TH><TH>Pengguna</TH><TH>Aktivitas</TH><TH>Detail</TH></tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.created_at, session.timezone)}</TD>
                  <TD>{r.actor?.full_name ?? "Sistem"}</TD>
                  <TD><Badge tone="brand">{activityLabel(r.action)}</Badge></TD>
                  <TD className="max-w-md truncate text-xs text-slate-500">{Object.entries(r.metadata ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} total={count ?? 0} basePath="/school/activity" size={30} />
      </Card>
    </>
  );
}
