"use client";
import { useState, useTransition } from "react";
import { Pencil, UserX } from "lucide-react";
import { toast } from "sonner";
import { removeMember, updateMember } from "@/features/schools/actions";
import { Avatar, Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export interface StudentRow {
  id: string;
  user_id: string;
  status: "active" | "disabled";
  student_number: string | null;
  created_at: string;
  profile: { full_name: string; email: string };
  classes: string[];
}

export function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<StudentRow | null>(null);
  const [nis, setNis] = useState("");
  const [remove, setRemove] = useState<StudentRow | null>(null);

  const run = (fn: () => ReturnType<typeof updateMember>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.message ?? "Berhasil"); after?.(); } else toast.error(r.error);
    });

  if (!rows.length) return <EmptyState className="m-4" title="Belum ada siswa" description="Undang siswa atau impor dari file CSV." />;

  return (
    <>
      <Table>
        <THead><tr><TH>Siswa</TH><TH>NIS</TH><TH>Kelas</TH><TH>Status</TH><TH>Bergabung</TH><TH className="text-right">Aksi</TH></tr></THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <Avatar name={r.profile.full_name || r.profile.email} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{r.profile.full_name || "—"}</p>
                    <p className="truncate text-xs text-slate-500">{r.profile.email}</p>
                  </div>
                </div>
              </TD>
              <TD className="font-mono text-xs">{r.student_number ?? "—"}</TD>
              <TD>{r.classes.length ? r.classes.join(", ") : <span className="text-slate-400">Belum ada kelas</span>}</TD>
              <TD>
                <button disabled={pending} onClick={() => run(() => updateMember(r.id, { status: r.status === "active" ? "disabled" : "active" }))}>
                  <Badge tone={r.status === "active" ? "green" : "red"}>{r.status === "active" ? "Aktif" : "Nonaktif"}</Badge>
                </button>
              </TD>
              <TD className="text-xs text-slate-500">{formatDate(r.created_at)}</TD>
              <TD className="text-right">
                <Button variant="ghost" size="icon" aria-label="Ubah NIS" onClick={() => { setEdit(r); setNis(r.student_number ?? ""); }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Keluarkan" onClick={() => setRemove(r)}><UserX className="h-4 w-4 text-rose-500" /></Button>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Ubah NIS"
        description={edit?.profile.full_name}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Batal</Button><Button loading={pending} onClick={() => edit && run(() => updateMember(edit.id, { student_number: nis }), () => setEdit(null))}>Simpan</Button></>}
      >
        <Input value={nis} onChange={(e) => setNis(e.target.value)} maxLength={30} aria-label="NIS" placeholder="Nomor induk siswa" />
      </Dialog>
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Keluarkan siswa?"
        description={<>{remove?.profile.full_name} akan kehilangan akses ke sekolah. Riwayat nilai tetap tersimpan.</>}
        confirmLabel="Keluarkan"
        loading={pending}
        onConfirm={() => remove && run(() => removeMember(remove.id), () => setRemove(null))}
      />
    </>
  );
}
