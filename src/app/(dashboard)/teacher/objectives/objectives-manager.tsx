"use client";
import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteObjective, saveObjective } from "@/features/quizzes/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { LearningObjective } from "@/types";

const PHASES = ["A", "B", "C", "D", "E", "F"];
const PHASE_HINT: Record<string, string> = { A: "Kelas 1–2", B: "Kelas 3–4", C: "Kelas 5–6", D: "Kelas 7–9", E: "Kelas 10", F: "Kelas 11–12" };
const empty = { code: "", description: "", subject_id: "", phase: "", grade_level: "" };

export function ObjectivesManager({ objectives, subjects, userId, isAdmin }: {
  objectives: LearningObjective[]; subjects: { id: string; name: string }[]; userId: string; isAdmin: boolean;
}) {
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [del, setDel] = useState<LearningObjective | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const visible = objectives.filter((o) => !filter || o.subject_id === filter);

  const submit = () => start(async () => {
    const r = await saveObjective(editing, form);
    if (r.ok) { toast.success(r.message ?? "OK"); setForm(empty); setEditing(null); } else toast.error(r.error);
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader title={editing ? "Ubah TP" : "Tambah TP"} />
        <CardBody className="space-y-4">
          <Field label="Kode" htmlFor="code" hint="Contoh: TP-7.1 atau MTK.D.1">
            <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={30} />
          </Field>
          <Field label="Deskripsi tujuan pembelajaran" htmlFor="desc" hint="Ditulis seperti di rapor, mis. “menganalisis struktur teks eksposisi”.">
            <Textarea id="desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mata pelajaran" htmlFor="subj">
              <Select id="subj" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                <option value="">Semua</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Fase" htmlFor="phase">
              <Select id="phase" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })}>
                <option value="">—</option>
                {PHASES.map((p) => <option key={p} value={p}>Fase {p} ({PHASE_HINT[p]})</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Kelas (opsional)" htmlFor="grade"><Input id="grade" value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: e.target.value })} maxLength={30} placeholder="X" /></Field>
          <div className="flex gap-2">
            {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm(empty); }}>Batal</Button>}
            <Button onClick={submit} loading={pending} disabled={!form.code.trim() || form.description.trim().length < 3}>
              <Plus className="h-4 w-4" /> {editing ? "Simpan perubahan" : "Tambah TP"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`${objectives.length} tujuan pembelajaran`} action={
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48" aria-label="Filter mapel">
            <option value="">Semua mapel</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        } />
        {visible.length === 0 ? (
          <EmptyState className="m-4" icon={Target} title="Belum ada TP" description="Tambahkan TP dari modul ajar atau ATP Anda." />
        ) : (
          <Table>
            <THead><tr><TH>Kode</TH><TH>Deskripsi</TH><TH>Mapel / Fase</TH><TH className="text-right">Aksi</TH></tr></THead>
            <tbody>
              {visible.map((o) => (
                <TR key={o.id}>
                  <TD className="font-mono font-semibold text-brand-700">{o.code}</TD>
                  <TD className="max-w-md text-sm text-slate-700">{o.description}</TD>
                  <TD className="text-xs text-slate-500">
                    {o.subject_id ? subjectName.get(o.subject_id) : "Umum"}{o.phase && <Badge className="ml-2" tone="violet">Fase {o.phase}</Badge>}
                  </TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => { setEditing(o.id); setForm({ code: o.code, description: o.description, subject_id: o.subject_id ?? "", phase: o.phase ?? "", grade_level: o.grade_level ?? "" }); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {(isAdmin || o.created_by === userId) && (
                      <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setDel(o)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Hapus ${del?.code}?`} loading={pending}
        description="Soal yang tertaut tidak terhapus, hanya kehilangan tautan TP-nya." confirmLabel="Hapus TP"
        onConfirm={() => start(async () => { if (!del) return; const r = await deleteObjective(del.id); if (r.ok) { toast.success(r.message ?? "OK"); setDel(null); } else toast.error(r.error); })} />
    </div>
  );
}
