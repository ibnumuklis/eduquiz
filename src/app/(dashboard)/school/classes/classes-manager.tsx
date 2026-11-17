"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { GraduationCap, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { deleteClass, saveClass } from "@/features/schools/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export interface ClassRow {
  id: string;
  name: string;
  grade_level: string | null;
  academic_year: string | null;
  homeroom_teacher_id: string | null;
  homeroom: { full_name: string } | null;
  student_count: number;
}

function ClassForm({ initial, teachers, onDone }: { initial: ClassRow | null; teachers: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action] = useActionState(saveClass.bind(null, initial?.id ?? null), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} toastSuccess />
      <Field label="Nama kelas" htmlFor="name" error={fieldError(state, "name")}>
        <Input id="name" name="name" defaultValue={initial?.name} required placeholder="X IPA 1" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tingkat" htmlFor="grade_level"><Input id="grade_level" name="grade_level" defaultValue={initial?.grade_level ?? ""} placeholder="10" /></Field>
        <Field label="Tahun ajaran" htmlFor="academic_year"><Input id="academic_year" name="academic_year" defaultValue={initial?.academic_year ?? ""} placeholder="2026/2027" /></Field>
      </div>
      <Field label="Wali kelas" htmlFor="homeroom_teacher_id">
        <Select id="homeroom_teacher_id" name="homeroom_teacher_id" defaultValue={initial?.homeroom_teacher_id ?? ""}>
          <option value="">— Tidak ada —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end"><SubmitButton>{initial ? "Simpan perubahan" : "Tambah kelas"}</SubmitButton></div>
    </form>
  );
}

export function ClassesManager({ rows, teachers }: { rows: ClassRow[]; teachers: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<ClassRow | null | "new">(null);
  const [del, setDel] = useState<ClassRow | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Tambah kelas</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Belum ada kelas" description="Buat kelas untuk mengelompokkan siswa dan menugaskan kuis." action={<Button onClick={() => setEditing("new")}>Tambah kelas</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <Card key={c.id} className="p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{c.name}</h3>
                  <p className="text-xs text-slate-500">{[c.grade_level && `Tingkat ${c.grade_level}`, c.academic_year].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label="Ubah kelas" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Hapus kelas" onClick={() => setDel(c)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-600">Wali: {c.homeroom?.full_name ?? "—"}</span>
                <Link href={`/school/classes/${c.id}`} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline">
                  <Users className="h-4 w-4" /> {c.student_count} siswa
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Tambah kelas" : "Ubah kelas"}>
        {editing !== null && <ClassForm initial={editing === "new" ? null : editing} teachers={teachers} onDone={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Hapus kelas ${del?.name}?`}
        description="Keanggotaan siswa dan penugasan kuis ke kelas ini akan dihapus. Nilai siswa tetap tersimpan."
        confirmLabel="Hapus kelas"
        loading={pending}
        onConfirm={() =>
          start(async () => {
            if (!del) return;
            const r = await deleteClass(del.id);
            if (r.ok) { toast.success(r.message ?? "Dihapus"); setDel(null); } else toast.error(r.error);
          })
        }
      />
    </>
  );
}
