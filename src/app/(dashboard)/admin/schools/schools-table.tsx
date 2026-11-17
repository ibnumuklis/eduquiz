"use client";
import { useState, useTransition } from "react";
import { Power, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { assignSchoolAdmin, setSchoolStatus } from "@/features/schools/actions";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export interface PlatformSchool { id: string; name: string; slug: string; status: "active" | "inactive"; created_at: string; teachers: number; students: number; quizzes: number; submissions: number }

export function SchoolsTable({ rows }: { rows: PlatformSchool[] }) {
  const [pending, start] = useTransition();
  const [toggle, setToggle] = useState<PlatformSchool | null>(null);
  const [assign, setAssign] = useState<PlatformSchool | null>(null);
  const [email, setEmail] = useState("");
  const [q, setQ] = useState("");
  const visible = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  if (!rows.length) return <EmptyState title="Belum ada sekolah" />;
  return (
    <Card>
      <div className="border-b border-slate-100 p-4"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari sekolah…" className="max-w-xs" aria-label="Cari sekolah" /></div>
      <Table>
        <THead><tr><TH>Sekolah</TH><TH>Status</TH><TH>Guru</TH><TH>Siswa</TH><TH>Kuis</TH><TH>Pengumpulan</TH><TH>Terdaftar</TH><TH className="text-right">Aksi</TH></tr></THead>
        <tbody>
          {visible.map((s) => (
            <TR key={s.id}>
              <TD><p className="font-semibold text-slate-800">{s.name}</p><p className="font-mono text-xs text-slate-400">{s.slug}</p></TD>
              <TD><Badge tone={s.status === "active" ? "green" : "red"}>{s.status === "active" ? "Aktif" : "Nonaktif"}</Badge></TD>
              <TD>{s.teachers}</TD><TD>{s.students}</TD><TD>{s.quizzes}</TD><TD>{s.submissions}</TD>
              <TD className="text-xs text-slate-500">{formatDate(s.created_at)}</TD>
              <TD className="whitespace-nowrap text-right">
                <Button variant="ghost" size="icon" aria-label="Tetapkan admin" onClick={() => { setAssign(s); setEmail(""); }}><UserPlus className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label={s.status === "active" ? "Nonaktifkan" : "Aktifkan"} onClick={() => setToggle(s)}>
                  <Power className={s.status === "active" ? "h-4 w-4 text-rose-500" : "h-4 w-4 text-emerald-600"} />
                </Button>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <ConfirmDialog
        open={!!toggle} onClose={() => setToggle(null)} loading={pending}
        tone={toggle?.status === "active" ? "danger" : "primary"}
        title={toggle?.status === "active" ? `Nonaktifkan ${toggle?.name}?` : `Aktifkan ${toggle?.name}?`}
        description={toggle?.status === "active" ? "Seluruh guru dan siswa sekolah ini kehilangan akses sampai diaktifkan kembali. Data tidak dihapus." : "Anggota sekolah dapat kembali mengakses EDUQUIZ."}
        confirmLabel={toggle?.status === "active" ? "Nonaktifkan" : "Aktifkan"}
        onConfirm={() => start(async () => { if (!toggle) return; const r = await setSchoolStatus(toggle.id, toggle.status === "active" ? "inactive" : "active"); if (r.ok) { toast.success(r.message ?? "OK"); setToggle(null); } else toast.error(r.error); })}
      />
      <Dialog open={!!assign} onClose={() => setAssign(null)} title="Tetapkan administrator" description={assign?.name} size="sm"
        footer={<><Button variant="outline" onClick={() => setAssign(null)}>Batal</Button><Button loading={pending} disabled={!email}
          onClick={() => start(async () => { if (!assign) return; const r = await assignSchoolAdmin(assign.id, email); if (r.ok) { toast.success(r.message ?? "OK", { duration: 10000 }); setAssign(null); } else toast.error(r.error); })}>Tetapkan</Button></>}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@sekolah.sch.id" aria-label="Email administrator" />
        <p className="mt-2 text-xs text-slate-500">Jika akun belum terdaftar, sistem membuat kode undangan admin yang terikat ke email ini.</p>
      </Dialog>
    </Card>
  );
}
