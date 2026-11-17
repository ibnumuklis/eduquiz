"use client";
import { useActionState, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";
import { isoToLocalInput } from "@/lib/utils";
import type { ActionResult, Quiz } from "@/types";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function QuizSettingsForm({
  action,
  initial,
  subjects,
  timezone,
  submitLabel,
}: {
  action: Action;
  initial?: Partial<Quiz> | null;
  subjects: { id: string; name: string }[];
  timezone: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [t, setT] = useState({
    shuffle_questions: initial?.shuffle_questions ?? false,
    shuffle_options: initial?.shuffle_options ?? false,
    show_result: initial?.show_result ?? true,
    show_explanation: initial?.show_explanation ?? false,
  });
  const err = (n: string) => fieldError(state, n);

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Informasi kuis" />
          <CardBody className="space-y-4">
            <FormResult state={state} />
            <Field label="Judul" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={initial?.title} required maxLength={150} placeholder="Ulangan Harian Bab 3 — Persamaan Linear" />
            </Field>
            <Field label="Deskripsi / petunjuk" htmlFor="description" error={err("description")}>
              <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} maxLength={2000} placeholder="Kerjakan dengan jujur. Baca setiap soal dengan teliti." />
            </Field>
            <Field label="Mata pelajaran" htmlFor="subject_id">
              <Select id="subject_id" name="subject_id" defaultValue={initial?.subject_id ?? ""}>
                <option value="">— Tanpa mata pelajaran —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Jadwal & durasi" description={`Waktu mengikuti zona sekolah (${timezone})`} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Mulai (opsional)" htmlFor="start_at" error={err("start_at")}>
              <Input id="start_at" name="start_at" type="datetime-local" defaultValue={isoToLocalInput(initial?.start_at, timezone)} />
            </Field>
            <Field label="Selesai (opsional)" htmlFor="end_at" error={err("end_at")}>
              <Input id="end_at" name="end_at" type="datetime-local" defaultValue={isoToLocalInput(initial?.end_at, timezone)} />
            </Field>
            <Field label="Durasi pengerjaan (menit)" htmlFor="duration_minutes" error={err("duration_minutes")}>
              <Input id="duration_minutes" name="duration_minutes" type="number" min={1} max={600} defaultValue={initial?.duration_minutes ?? 30} required />
            </Field>
            <Field label="Batas percobaan" htmlFor="max_attempts" error={err("max_attempts")}>
              <Input id="max_attempts" name="max_attempts" type="number" min={1} max={20} defaultValue={initial?.max_attempts ?? 1} required />
            </Field>
          </CardBody>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Penilaian & akses" />
          <CardBody className="space-y-4">
            <Field label="Passing grade (0–100)" htmlFor="passing_grade" error={err("passing_grade")}>
              <Input id="passing_grade" name="passing_grade" type="number" min={0} max={100} step="0.5" defaultValue={initial?.passing_grade ?? 70} required />
            </Field>
            <Field label="Akses kuis" htmlFor="access" hint="Kode akses memungkinkan siswa sekolah Anda bergabung tanpa ditugaskan per kelas.">
              <Select id="access" name="access" defaultValue={initial?.access ?? "assigned"}>
                <option value="assigned">Hanya kelas yang ditugaskan</option>
                <option value="code">Hanya dengan kode akses</option>
                <option value="both">Kelas ditugaskan + kode akses</option>
              </Select>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Opsi pengerjaan" />
          <CardBody className="space-y-3">
            <Toggle name="shuffle_questions" checked={t.shuffle_questions} onChange={(v) => setT({ ...t, shuffle_questions: v })} label="Acak urutan soal" />
            <Toggle name="shuffle_options" checked={t.shuffle_options} onChange={(v) => setT({ ...t, shuffle_options: v })} label="Acak urutan opsi" />
            <Toggle name="show_result" checked={t.show_result} onChange={(v) => setT({ ...t, show_result: v, show_explanation: v && t.show_explanation })} label="Tampilkan nilai ke siswa" />
            <Toggle name="show_explanation" checked={t.show_explanation} disabled={!t.show_result} onChange={(v) => setT({ ...t, show_explanation: v })} label="Tampilkan kunci & pembahasan" description="Setelah siswa mengumpulkan" />
          </CardBody>
        </Card>
        <SubmitButton size="lg" className="w-full">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
