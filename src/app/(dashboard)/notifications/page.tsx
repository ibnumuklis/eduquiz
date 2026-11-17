import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireSession } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { MarkAllRead } from "./mark-all-read";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifikasi" };

export default async function NotificationsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="Notifikasi" description={`${rows.filter((r) => !r.read_at).length} belum dibaca`} actions={<MarkAllRead />} />
      {rows.length === 0 ? <EmptyState icon={Bell} title="Belum ada notifikasi" /> : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => {
              const body = (
                <div className={cn("flex gap-3 px-5 py-4", !n.read_at && "bg-brand-50/40")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-slate-200" : "bg-brand-500")} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{n.title}</p>
                    {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at, session.timezone)}</p>
                  </div>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-slate-50">{body}</Link> : body}</li>;
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
