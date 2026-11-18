"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Clock3, Radio, RefreshCw, ShieldAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, ProgressBar, type BadgeTone } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, formatDateTime, formatRelative, formatScore } from "@/lib/utils";
import type { MonitorRow, MonitorStatus } from "@/types";

export const STATUS_META: Record<MonitorStatus, { label: string; tone: BadgeTone }> = {
  not_started: { label: "Belum mulai", tone: "slate" },
  in_progress: { label: "Sedang mengerjakan", tone: "brand" },
  completed: { label: "Selesai", tone: "green" },
  late: { label: "Terlambat", tone: "amber" },
  missed: { label: "Tidak mengumpulkan", tone: "red" },
};

const INTEGRITY_LABEL: Record<string, string> = {
  tab_hidden: "Meninggalkan tab kuis",
  window_blur: "Berpindah ke jendela/aplikasi lain",
  fullscreen_exit: "Keluar dari layar penuh",
  copy: "Mencoba menyalin",
  paste: "Mencoba menempel",
  context_menu: "Membuka menu klik kanan",
};

export function LiveMonitor({ quizId, initial, timezone }: { quizId: string; initial: MonitorRow[]; timezone: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initial);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<MonitorStatus | "">("");
  const [q, setQ] = useState("");
  const [, setTick] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [events, setEvents] = useState<{ row: MonitorRow; items: { kind: string; created_at: string }[] } | null>(null);

  const openEvents = async (row: MonitorRow) => {
    if (!row.attempt_id) return;
    const { data } = await supabase.from("integrity_events").select("kind, created_at").eq("attempt_id", row.attempt_id).order("created_at").limit(500);
    setEvents({ row, items: (data ?? []) as { kind: string; created_at: string }[] });
  };

  const refresh = async () => {
    const { data } = await supabase.rpc("get_quiz_monitor", { p_quiz: quizId });
    if (data) setRows(data as MonitorRow[]);
  };

  useEffect(() => {
    // Realtime: RLS ensures only this teacher's quiz attempts are delivered.
    const schedule = () => {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(async () => {
        const { data } = await supabase.rpc("get_quiz_monitor", { p_quiz: quizId });
        if (data) setRows(data as MonitorRow[]);
      }, 800);
    };
    const channel = supabase
      .channel(`monitor:${quizId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_attempts", filter: `quiz_id=eq.${quizId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_results", filter: `quiz_id=eq.${quizId}` }, schedule)
      .subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    // Re-render relative times every 30s (no network calls).
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => {
      clearInterval(t);
      clearTimeout(debounce.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, quizId]);

  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const visible = rows.filter((r) => (!filter || r.status === filter) && `${r.full_name} ${r.email} ${r.class_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(Object.keys(STATUS_META) as MonitorStatus[]).map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? "" : s)}
            className={cn("rounded-2xl border bg-white p-3 text-left transition hover:shadow-sm", filter === s ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200")}>
            <p className="text-2xl font-bold text-slate-900">{counts[s] ?? 0}</p>
            <p className="text-xs text-slate-500">{STATUS_META[s].label}</p>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
            <Radio className={cn("h-3.5 w-3.5", live && "animate-pulse")} /> {live ? "Live" : "Menghubungkan…"}
          </span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari siswa / kelas…" className="max-w-xs" aria-label="Cari siswa" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as MonitorStatus | "")} className="w-48" aria-label="Filter status">
            <option value="">Semua status</option>
            {(Object.keys(STATUS_META) as MonitorStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </Select>
          <Button variant="ghost" size="sm" onClick={refresh} className="ml-auto"><RefreshCw className="h-4 w-4" /> Muat ulang</Button>
        </div>
        {visible.length === 0 ? (
          <EmptyState className="m-4" title="Tidak ada siswa" description="Tugaskan kuis ke kelas agar daftar siswa muncul di sini." />
        ) : (
          <Table>
            <THead><tr><TH>Siswa</TH><TH>Kelas</TH><TH>Status</TH><TH>Progres</TH><TH>Integritas</TH><TH>Mulai</TH><TH>Terakhir aktif</TH><TH>Dikumpulkan</TH><TH className="text-right">Nilai</TH></tr></THead>
            <tbody>
              {visible.map((r) => (
                <TR key={r.student_id}>
                  <TD>
                    <p className="font-medium text-slate-800">{r.full_name}</p>
                    <p className="text-xs text-slate-500">{r.email}</p>
                    {Number(r.time_multiplier) > 1 && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600"><Clock3 className="h-3 w-3" /> Waktu ×{Number(r.time_multiplier)}</span>}
                  </TD>
                  <TD>{r.class_name ?? <span className="text-slate-400">Kode akses</span>}</TD>
                  <TD><Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge></TD>
                  <TD className="min-w-36">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={Number(r.progress)} className="w-20" />
                      <span className="text-xs text-slate-600">{r.answered_count}/{r.total_questions}</span>
                    </div>
                  </TD>
                  <TD>
                    {r.integrity_count > 0 ? (
                      <button onClick={() => openEvents(r)} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                        r.integrity_count >= 3 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}>
                        <ShieldAlert className="h-3.5 w-3.5" /> {r.integrity_count}
                      </button>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </TD>
                  <TD className="text-xs text-slate-500">{formatDateTime(r.started_at, timezone)}</TD>
                  <TD className="text-xs text-slate-500">{r.status === "in_progress" ? formatRelative(r.last_active_at) : "—"}</TD>
                  <TD className="text-xs text-slate-500">{formatDateTime(r.submitted_at, timezone)}</TD>
                  <TD className="text-right">
                    {r.attempt_id && r.score !== null ? (
                      <Link href={`/teacher/attempts/${r.attempt_id}`} className="font-bold text-brand-700 hover:underline">
                        {formatScore(r.score)}{r.pending_manual ? <span className="ml-1 text-xs font-normal text-amber-600">*</span> : null}
                      </Link>
                    ) : "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">* menunggu koreksi manual. Integritas = pindah tab, keluar layar penuh, salin/tempel (sinyal, bukan bukti). Data diperbarui otomatis melalui Supabase Realtime.</p>
      </Card>
      <Dialog open={!!events} onClose={() => setEvents(null)} title={`Catatan integritas — ${events?.row.full_name ?? ""}`}
        description="Gunakan sebagai bahan percakapan dengan siswa, bukan bukti tunggal kecurangan.">
        <ul className="space-y-1.5 text-sm">
          {events?.items.map((e, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>{INTEGRITY_LABEL[e.kind] ?? e.kind}</span>
              <span className="text-xs text-slate-500">{formatDateTime(e.created_at, timezone)}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
