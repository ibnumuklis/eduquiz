"use client";
import { useState, useTransition } from "react";
import { Accessibility } from "lucide-react";
import { toast } from "sonner";
import { saveAccommodation } from "@/features/quizzes/actions";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export interface AccStudent { id: string; name: string; classes: string[] }
interface Setting { time_multiplier: number; reduce_options: boolean; read_aloud: boolean; notes: string | null }
const DEFAULT: Setting = { time_multiplier: 1, reduce_options: false, read_aloud: false, notes: null };

function Row({ s, initial }: { s: AccStudent; initial?: Setting }) {
  const [v, setV] = useState<Setting>(initial ?? DEFAULT);
  const [saved, setSaved] = useState<Setting>(initial ?? DEFAULT);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const active = saved.time_multiplier > 1 || saved.reduce_options || saved.read_aloud;
  return (
    <TR className={active ? "bg-violet-50/40" : ""}>
      <TD><p className="font-medium text-slate-800">{s.name}</p><p className="text-xs text-slate-500">{s.classes.join(", ") || "—"}</p></TD>
      <TD>
        <Select value={String(v.time_multiplier)} onChange={(e) => setV({ ...v, time_multiplier: Number(e.target.value) })} className="h-9 w-28" aria-label={`Waktu ${s.name}`}>
          {[1, 1.25, 1.5, 2, 3].map((m) => <option key={m} value={m}>{m === 1 ? "Normal" : `×${m}`}</option>)}
        </Select>
      </TD>
      <TD><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.reduce_options} onChange={(e) => setV({ ...v, reduce_options: e.target.checked })} aria-label={`Kurangi opsi ${s.name}`} /></TD>
      <TD><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.read_aloud} onChange={(e) => setV({ ...v, read_aloud: e.target.checked })} aria-label={`Bacakan soal ${s.name}`} /></TD>
      <TD><Input value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value || null })} maxLength={500} className="h-9 min-w-40" placeholder="Catatan (opsional)" aria-label={`Catatan ${s.name}`} /></TD>
      <TD className="text-right">
        <Button size="sm" disabled={!dirty} loading={pending} onClick={() => start(async () => {
          const r = await saveAccommodation({ student_id: s.id, ...v, notes: v.notes ?? "" });
          if (r.ok) { toast.success(r.message ?? "OK"); setSaved(v); } else toast.error(r.error);
        })}>Simpan</Button>
      </TD>
    </TR>
  );
}

export function AccommodationsTable({ students, settings }: { students: AccStudent[]; settings: Record<string, Setting> }) {
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const visible = students.filter((s) => `${s.name} ${s.classes.join(" ")}`.toLowerCase().includes(q.toLowerCase()) && (!onlyActive || settings[s.id]));
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari siswa / kelas…" className="max-w-xs" aria-label="Cari siswa" />
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="accent-brand-600" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Hanya yang memiliki akomodasi</label>
      </div>
      {visible.length === 0 ? (
        <EmptyState className="m-4" icon={Accessibility} title="Tidak ada siswa" description="Siswa dari kelas yang Anda ajar akan muncul di sini." />
      ) : (
        <Table>
          <THead><tr><TH>Siswa</TH><TH>Waktu</TH><TH>Kurangi opsi</TH><TH>Bacakan soal</TH><TH>Catatan</TH><TH /></tr></THead>
          <tbody>{visible.map((s) => <Row key={s.id} s={s} initial={settings[s.id]} />)}</tbody>
        </Table>
      )}
    </Card>
  );
}
