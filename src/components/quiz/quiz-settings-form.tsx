"use client";
import { useActionState, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";
import { cn, isoToLocalInput } from "@/lib/utils";
import { QUIZ_MODES, QUIZ_MODE_META, QUIZ_THEMES, QUIZ_THEME_LABEL } from "@/lib/validations/quiz";
import type { ActionResult, Quiz, QuizMode } from "@/types";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function QuizSettingsForm({
  action,
  initial,
  subjects,
  folders = [],
  timezone,
  submitLabel,
}: {
  action: Action;
  initial?: Partial<Quiz> | null;
  subjects: { id: string; name: string }[];
  folders?: { id: string; name: string }[];
  timezone: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [t, setT] = useState({
    shuffle_questions: initial?.shuffle_questions ?? false,
    shuffle_options: initial?.shuffle_options ?? false,
    show_result: initial?.show_result ?? true,
    show_explanation: initial?.show_explanation ?? false,
    require_fullscreen: initial?.require_fullscreen ?? false,
    detect_tab_switch: initial?.detect_tab_switch ?? true,
    show_watermark: initial?.show_watermark ?? false,
    powerups_enabled: initial?.powerups_enabled ?? false,
    instant_feedback: initial?.instant_feedback ?? false,
  });
  const [mode, setMode] = useState<QuizMode>(initial?.mode ?? "standard");
  const exam = mode === "exam";
  const practice = mode === "practice";
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mata pelajaran" htmlFor="subject_id">
                <Select id="subject_id" name="subject_id" defaultValue={initial?.subject_id ?? ""}>
                  <option value="">— Tanpa mata pelajaran —</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Folder" htmlFor="folder_id" hint={folders.length ? undefined : "Buat folder di halaman Kuis Saya."}>
                <Select id="folder_id" name="folder_id" defaultValue={initial?.folder_id ?? ""}>
                  <option value="">— Tanpa folder —</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  {initial?.folder_id && !folders.some((f) => f.id === initial.folder_id) && <option value={initial.folder_id}>Folder milik guru pembuat</option>}
                </Select>
              </Field>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Mode kuis" description="Menentukan cara siswa mengerjakan dan bagaimana nilai dihitung" />
          <CardBody className="space-y-4">
            <input type="hidden" name="mode" value={mode} />
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Mode kuis">
              {QUIZ_MODES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={cn("rounded-2xl border-2 p-4 text-left transition", mode === m ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-200")}>
                  <p className="font-semibold text-slate-900">{QUIZ_MODE_META[m].label}</p>
                  <p className="mt-1 text-xs text-slate-500">{QUIZ_MODE_META[m].description}</p>
                </button>
              ))}
            </div>
            {practice && (
              <Field label="Target penguasaan (%)" htmlFor="mastery_target" error={err("mastery_target")}
                hint="Siswa dapat berlatih ulang soal yang salah hingga penguasaan kumulatif mencapai target ini. Nilai & pembahasan selalu ditampilkan.">
                <Input id="mastery_target" name="mastery_target" type="number" min={0} max={100} step="1" defaultValue={initial?.mastery_target ?? 80} className="max-w-40" />
              </Field>
            )}
            {!practice && <input type="hidden" name="mastery_target" value={initial?.mastery_target ?? 80} />}
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
            <Field label="Batas percobaan" htmlFor="max_attempts" error={err("max_attempts")} hint={practice ? "Tidak berlaku di mode latihan." : undefined}>
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
            <Toggle name="show_result" checked={practice || t.show_result} disabled={practice} onChange={(v) => setT({ ...t, show_result: v, show_explanation: v && t.show_explanation })} label="Tampilkan nilai ke siswa" />
            <Toggle name="show_explanation" checked={practice || t.show_explanation} disabled={practice || !t.show_result} onChange={(v) => setT({ ...t, show_explanation: v })} label="Tampilkan kunci & pembahasan" description="Setelah siswa mengumpulkan" />
            {practice && <><input type="hidden" name="show_result" value="on" /><input type="hidden" name="show_explanation" value="on" /></>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Integritas (anti-curang)" description="Sinyal untuk guru, bukan hukuman otomatis" />
          <CardBody className="space-y-3">
            <Toggle name="detect_tab_switch" checked={t.detect_tab_switch} onChange={(v) => setT({ ...t, detect_tab_switch: v })} label="Catat pindah tab / aplikasi" description="Muncul langsung di Monitoring" />
            <Toggle name="require_fullscreen" checked={t.require_fullscreen} onChange={(v) => setT({ ...t, require_fullscreen: v })} label="Wajib layar penuh" description="Keluar layar penuh tercatat (tidak berlaku di iPhone)" />
            <Toggle name="show_watermark" checked={t.show_watermark} onChange={(v) => setT({ ...t, show_watermark: v })} label="Tanda air nama siswa" description="Mencegah soal difoto & disebar" />
            {exam && <p className="text-xs text-slate-500">Mode ujian otomatis menonaktifkan salin/tempel & klik kanan.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Gamifikasi" description={exam ? "Tidak tersedia di mode ujian" : "Fitur menyenangkan yang tidak memengaruhi nilai akurasi"} />
          <CardBody className="space-y-3">
            <Toggle name="instant_feedback" checked={!exam && t.instant_feedback} disabled={exam} onChange={(v) => setT({ ...t, instant_feedback: v })} label="Umpan balik langsung" description="Siswa memeriksa tiap jawaban (lalu terkunci)" />
            <Toggle name="powerups_enabled" checked={!exam && t.powerups_enabled} disabled={exam} onChange={(v) => setT({ ...t, powerups_enabled: v })} label="Power-up positif" description="50:50, Petunjuk, Kesempatan Kedua — sekali pakai" />
            <Field label="Tema tampilan" htmlFor="theme">
              <Select id="theme" name="theme" defaultValue={initial?.theme ?? "default"}>
                {QUIZ_THEMES.map((th) => <option key={th} value={th}>{QUIZ_THEME_LABEL[th]}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>
        <SubmitButton size="lg" className="w-full">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
