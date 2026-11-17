"use client";
import { useState, useTransition } from "react";
import { Plus, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { assignTeaching, removeMember, removeTeaching, updateMember } from "@/features/schools/actions";
import { Card } from "@/components/ui/card";
import { Avatar, Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { ActionResult, MemberRole } from "@/types";

export interface StaffRow {
  id: string;
  user_id: string;
  role: MemberRole;
  status: "active" | "disabled";
  profile: { full_name: string; email: string };
  teaching: { id: string; label: string }[];
}
type Opt = { id: string; name: string };

export function TeachersManager({ rows, subjects, classes, currentUserId }: { rows: StaffRow[]; subjects: Opt[]; classes: Opt[]; currentUserId: string }) {
  const [pending, start] = useTransition();
  const [assignFor, setAssignFor] = useState<StaffRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StaffRow | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [classId, setClassId] = useState("");

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Berhasil");
        after?.();
      } else toast.error(r.error);
    });

  if (!rows.length) return <EmptyState title="Belum ada guru" description="Undang guru dengan kode undangan." />;

  return (
    <Card>
      <Table>
        <THead>
          <tr><TH>Nama</TH><TH>Peran</TH><TH>Status</TH><TH>Mengajar</TH><TH className="text-right">Aksi</TH></tr>
        </THead>
        <tbody>
          {rows.map((r) => {
            const self = r.user_id === currentUserId;
            return (
              <TR key={r.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.profile.full_name || r.profile.email} />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{r.profile.full_name || "—"} {self && <Badge tone="brand">Anda</Badge>}</p>
                      <p className="truncate text-xs text-slate-500">{r.profile.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <Select
                    aria-label="Peran"
                    className="h-9 w-40"
                    value={r.role}
                    disabled={self || pending}
                    onChange={(e) => run(() => updateMember(r.id, { role: e.target.value as MemberRole }))}
                  >
                    <option value="teacher">Guru</option>
                    <option value="school_admin">Admin Sekolah</option>
                  </Select>
                </TD>
                <TD>
                  <button
                    disabled={self || pending}
                    onClick={() => run(() => updateMember(r.id, { status: r.status === "active" ? "disabled" : "active" }))}
                    className="disabled:cursor-not-allowed"
                    title={self ? "Tidak dapat mengubah akun sendiri" : "Klik untuk mengubah status"}
                  >
                    <Badge tone={r.status === "active" ? "green" : "red"}>{r.status === "active" ? "Aktif" : "Nonaktif"}</Badge>
                  </button>
                </TD>
                <TD>
                  <div className="flex max-w-xs flex-wrap gap-1.5">
                    {r.teaching.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-700">
                        {t.label}
                        <button aria-label={`Hapus ${t.label}`} onClick={() => run(() => removeTeaching(t.id))} className="rounded-full p-0.5 hover:bg-brand-100">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <button onClick={() => setAssignFor(r)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600">
                      <Plus className="h-3 w-3" /> Tugaskan
                    </button>
                  </div>
                </TD>
                <TD className="text-right">
                  <Button variant="ghost" size="icon" disabled={self} onClick={() => setRemoveTarget(r)} aria-label="Keluarkan dari sekolah">
                    <UserX className="h-4 w-4 text-rose-500" />
                  </Button>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>

      <Dialog
        open={!!assignFor}
        onClose={() => setAssignFor(null)}
        title="Tugaskan mengajar"
        description={assignFor?.profile.full_name}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignFor(null)}>Batal</Button>
            <Button
              loading={pending}
              disabled={!subjectId || !classId}
              onClick={() => assignFor && run(() => assignTeaching(assignFor.user_id, subjectId, classId), () => setAssignFor(null))}
            >
              Simpan
            </Button>
          </>
        }
      >
        {subjects.length === 0 || classes.length === 0 ? (
          <p className="text-sm text-slate-600">Tambahkan mata pelajaran dan kelas terlebih dahulu.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Mata pelajaran
              <Select className="mt-1.5" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Pilih…</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">Kelas
              <Select className="mt-1.5" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Pilih…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Keluarkan dari sekolah?"
        description={<>Akun <strong>{removeTarget?.profile.full_name}</strong> tidak akan bisa mengakses data sekolah ini lagi. Kuis yang sudah dibuat tetap tersimpan.</>}
        confirmLabel="Keluarkan"
        loading={pending}
        onConfirm={() => removeTarget && run(() => removeMember(removeTarget.id), () => setRemoveTarget(null))}
      />
    </Card>
  );
}
