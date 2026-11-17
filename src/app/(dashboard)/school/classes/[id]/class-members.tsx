"use client";
import { useMemo, useState, useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addStudentsToClass, removeStudentFromClass } from "@/features/schools/actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

type Student = { id: string; name: string; email: string; nis?: string | null };

export function ClassMembers({ classId, members, available }: { classId: string; members: Student[]; available: Student[] }) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => available.filter((s) => `${s.name} ${s.email} ${s.nis ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [available, q],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Anggota kelas" description={`${members.length} siswa`} />
        {members.length === 0 ? (
          <EmptyState className="m-4" title="Kelas masih kosong" description="Tambahkan siswa dari daftar di samping." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{m.name}</p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                <Button
                  variant="ghost" size="icon" aria-label={`Keluarkan ${m.name}`} disabled={pending}
                  onClick={() => start(async () => { const r = await removeStudentFromClass(classId, m.id); if (r.ok) toast.success(r.message ?? "OK"); else toast.error(r.error); })}
                >
                  <UserMinus className="h-4 w-4 text-rose-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Tambah siswa"
          description="Siswa sekolah yang belum ada di kelas ini"
          action={
            <Button
              size="sm" disabled={!selected.size} loading={pending}
              onClick={() => start(async () => {
                const r = await addStudentsToClass(classId, [...selected]);
                if (r.ok) { toast.success(r.message ?? "OK"); setSelected(new Set()); } else toast.error(r.error);
              })}
            >
              <UserPlus className="h-4 w-4" /> Tambah ({selected.size})
            </Button>
          }
        />
        <div className="p-4 pb-2"><Input placeholder="Cari siswa…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari siswa" /></div>
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Tidak ada siswa yang tersedia.</p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                  <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
                    <span className="block truncate text-xs text-slate-500">{s.email}{s.nis ? ` · NIS ${s.nis}` : ""}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
