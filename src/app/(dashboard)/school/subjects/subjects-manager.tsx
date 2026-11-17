"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSubject, saveSubject } from "@/features/schools/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

interface Row { id: string; name: string; code: string | null; quizzes: number; teachers: number }

function SubjectForm({ initial, onDone }: { initial: Row | null; onDone: () => void }) {
  const [state, action] = useActionState(saveSubject.bind(null, initial?.id ?? null), null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      <Field label="Nama mata pelajaran" htmlFor="name" error={fieldError(state, "name")}>
        <Input id="name" name="name" defaultValue={initial?.name} required placeholder="Matematika" />
      </Field>
      <Field label="Kode (opsional)" htmlFor="code" error={fieldError(state, "code")}>
        <Input id="code" name="code" defaultValue={initial?.code ?? ""} placeholder="MTK" />
      </Field>
      <div className="flex justify-end"><SubmitButton>{initial ? "Simpan" : "Tambah"}</SubmitButton></div>
    </form>
  );
}

export function SubjectsManager({ rows }: { rows: Row[] }) {
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const [del, setDel] = useState<Row | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Tambah mata pelajaran</Button></div>
      {rows.length === 0 ? (
        <EmptyState icon={BookOpen} title="Belum ada mata pelajaran" action={<Button onClick={() => setEditing("new")}>Tambah</Button>} />
      ) : (
        <Card>
          <Table>
            <THead><tr><TH>Nama</TH><TH>Kode</TH><TH>Guru pengajar</TH><TH>Kuis</TH><TH className="text-right">Aksi</TH></tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-slate-800">{r.name}</TD>
                  <TD className="font-mono text-xs">{r.code ?? "—"}</TD>
                  <TD>{r.teachers}</TD>
                  <TD>{r.quizzes}</TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="icon" aria-label="Ubah" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setDel(r)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Tambah mata pelajaran" : "Ubah mata pelajaran"} size="sm">
        {editing !== null && <SubjectForm initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} title={`Hapus ${del?.name}?`}
        description="Penugasan mengajar untuk mata pelajaran ini ikut terhapus. Kuis tetap ada tanpa mata pelajaran."
        confirmLabel="Hapus" loading={pending}
        onConfirm={() => start(async () => { if (!del) return; const r = await deleteSubject(del.id); if (r.ok) { toast.success(r.message ?? "OK"); setDel(null); } else toast.error(r.error); })}
      />
    </>
  );
}
