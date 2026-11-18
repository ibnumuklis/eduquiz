"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ImagePlus, Lightbulb, Plus, Square, SquareCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { saveQuestion } from "@/features/quizzes/actions";
import {
  KEYED_TEXT_TYPES, OPTION_TYPES, QUESTION_TYPE_GROUPS, QUESTION_TYPE_LABEL, SURVEY_TYPES, questionSchema, type QuestionInput,
} from "@/lib/validations/quiz";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { QuestionPayload, QuestionType } from "@/types";

export interface EditableQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  explanation: string | null;
  image_path: string | null;
  image_url?: string | null;
  accepted_answers: string[];
  case_sensitive: boolean;
  manual_grading: boolean;
  payload?: QuestionPayload | null;
  stimulus_id?: string | null;
  objective_id?: string | null;
  question_options: { id: string; label: string; is_correct: boolean; match_text?: string | null }[];
}

type Opt = { id: string; label: string; is_correct: boolean; match_text: string };
const blank = (n: number, correctFirst = false): Opt[] =>
  Array.from({ length: n }, (_, i) => ({ id: "", label: "", is_correct: correctFirst && i === 0, match_text: "" }));
const TF_OPTIONS: Opt[] = [
  { id: "", label: "Benar", is_correct: true, match_text: "" },
  { id: "", label: "Salah", is_correct: false, match_text: "" },
];
const defaultOptions = (t: string): Opt[] =>
  t === "true_false" ? TF_OPTIONS : t === "tf_grid" || t === "matching" ? blank(3) : t === "poll" ? blank(3) : blank(4, t !== "ordering");
const MAX_IMAGE = 5 * 1024 * 1024;

const OPTION_HELP: Partial<Record<QuestionType, string>> = {
  multiple_choice: "Klik ikon untuk menandai satu jawaban benar.",
  multiple_select: "Klik ikon untuk menandai semua jawaban benar. Nilai parsial: benar − salah.",
  true_false: "Tandai jawaban yang benar.",
  tf_grid: "Tulis setiap pernyataan, lalu pilih kuncinya: Benar atau Salah. Nilai parsial per pernyataan.",
  matching: "Tulis pasangan kiri ↔ kanan yang benar. Siswa melihat pilihan kanan secara acak.",
  ordering: "Tulis item dalam urutan yang BENAR. Siswa melihatnya teracak. Nilai parsial per posisi.",
  poll: "Polling tidak memiliki jawaban benar dan tidak dihitung ke nilai.",
};

export function QuestionEditor({
  quizId,
  schoolId,
  initial,
  stimuli = [],
  objectives = [],
  onSaved,
  onCancel,
}: {
  quizId: string;
  schoolId: string;
  initial: EditableQuestion | null;
  stimuli?: { id: string; title: string | null; content: string }[];
  objectives?: { id: string; code: string; description: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(initial?.image_url ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<QuestionInput>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      type: initial?.type ?? "multiple_choice",
      prompt: initial?.prompt ?? "",
      points: initial?.points ?? 10,
      explanation: initial?.explanation ?? "",
      image_path: initial?.image_path ?? null,
      options: initial?.question_options.length
        ? initial.question_options.map((o) => ({ id: o.id, label: o.label, is_correct: o.is_correct, match_text: o.match_text ?? "" }))
        : defaultOptions(initial?.type ?? "multiple_choice"),
      accepted_answers: initial?.accepted_answers ?? [],
      case_sensitive: initial?.case_sensitive ?? false,
      manual_grading: initial?.manual_grading ?? false,
      stimulus_id: initial?.stimulus_id ?? "",
      objective_id: initial?.objective_id ?? "",
      payload: { hint: initial?.payload?.hint ?? "", rubric: initial?.payload?.rubric ?? [] },
    },
  });
  const { register, control, setValue, handleSubmit, formState: { errors } } = form;
  const options = useFieldArray({ control, name: "options" });
  const rubric = useFieldArray({ control, name: "payload.rubric" });
  const type = useWatch({ control, name: "type" }) as QuestionType;
  const optionValues = useWatch({ control, name: "options" });
  const rubricValues = useWatch({ control, name: "payload.rubric" });
  const usesOptions = OPTION_TYPES.has(type);
  const [answersText, setAnswersText] = useState((initial?.accepted_answers ?? []).join("\n"));

  // Keep the option set consistent with the chosen type.
  const prevType = useRef(type);
  useEffect(() => {
    if (prevType.current === type) return;
    const from = prevType.current;
    prevType.current = type;
    if (!OPTION_TYPES.has(type)) return;
    const current = (form.getValues("options") ?? []) as Opt[];
    const keep = OPTION_TYPES.has(from) && from !== "true_false" && type !== "true_false" && current.length >= 2;
    if (!keep) {
      options.replace(defaultOptions(type));
      return;
    }
    if (type === "multiple_choice") {
      const first = Math.max(0, current.findIndex((o) => o.is_correct));
      current.forEach((_, i) => setValue(`options.${i}.is_correct`, i === first));
    } else if (type === "poll" || type === "ordering" || type === "matching") {
      current.forEach((_, i) => setValue(`options.${i}.is_correct`, false));
    }
  }, [type, options, form, setValue]);

  function markCorrect(index: number) {
    const current = form.getValues("options") ?? [];
    if (type === "multiple_select" || type === "tf_grid") setValue(`options.${index}.is_correct`, !current[index].is_correct, { shouldDirty: true });
    else current.forEach((_, i) => setValue(`options.${i}.is_correct`, i === index, { shouldDirty: true }));
  }

  async function onImage(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("File harus berupa gambar");
    if (file.size > MAX_IMAGE) return toast.error("Ukuran gambar maksimal 5 MB");
    setUploading(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${schoolId}/${quizId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from("quiz-media").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    setUploading(false);
    if (error) return toast.error("Gagal mengunggah gambar");
    setValue("image_path", path, { shouldDirty: true });
    setPreview(URL.createObjectURL(file));
  }

  const onSubmit = handleSubmit((values) =>
    start(async () => {
      const payload: QuestionInput = {
        ...values,
        options: usesOptions ? values.options : [],
        accepted_answers: KEYED_TEXT_TYPES.has(type) ? answersText.split("\n").map((s) => s.trim()).filter(Boolean) : [],
        payload: {
          hint: SURVEY_TYPES.has(type) || type === "essay" ? "" : values.payload?.hint ?? "",
          rubric: type === "essay" ? (values.payload?.rubric ?? []).filter((r) => r.criterion?.trim()) : [],
        },
      };
      const r = await saveQuestion(quizId, initial?.id ?? null, payload);
      if (r.ok) {
        toast.success(r.message ?? "Tersimpan");
        onSaved();
      } else toast.error(r.error);
    }),
  );

  const optionError = errors.options as { message?: string; root?: { message?: string } } | undefined;
  const rubricTotal = (rubricValues ?? []).reduce((s, r) => s + (Number(r?.points) || 0), 0);
  const points = Number(useWatch({ control, name: "points" })) || 0;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Tipe soal" htmlFor="type">
          <Select id="type" {...register("type")}>
            {QUESTION_TYPE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label={SURVEY_TYPES.has(type) ? "Bobot (tidak dinilai)" : "Bobot nilai"} htmlFor="points" error={errors.points?.message}>
          <Input id="points" type="number" step="0.5" min={0.5} max={1000} {...register("points")} readOnly={SURVEY_TYPES.has(type)} />
        </Field>
      </div>

      {(stimuli.length > 0 || objectives.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {stimuli.length > 0 && (
            <Field label="Stimulus / bacaan" htmlFor="stimulus_id" hint="Soal dengan stimulus yang sama ditampilkan berdampingan.">
              <Select id="stimulus_id" {...register("stimulus_id")}>
                <option value="">— Tanpa stimulus —</option>
                {stimuli.map((s) => <option key={s.id} value={s.id}>{s.title || s.content.slice(0, 60)}</option>)}
              </Select>
            </Field>
          )}
          {objectives.length > 0 && (
            <Field label="Tujuan Pembelajaran (TP)" htmlFor="objective_id" hint="Dipakai untuk laporan ketuntasan per TP.">
              <Select id="objective_id" {...register("objective_id")}>
                <option value="">— Tidak ditautkan —</option>
                {objectives.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.description.slice(0, 70)}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      <Field
        label="Pertanyaan"
        htmlFor="prompt"
        error={errors.prompt?.message}
        hint={type === "fill_blank" ? "Gunakan ___ (tiga garis bawah) untuk menandai bagian yang dikosongkan." : undefined}
      >
        <Textarea id="prompt" rows={4} {...register("prompt")} placeholder={type === "fill_blank" ? "Ibu kota Indonesia adalah ___." : "Tulis pertanyaan…"} />
      </Field>

      <div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
        {preview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Gambar soal" className="max-h-48 rounded-xl border border-slate-200" />
            <button type="button" onClick={() => { setPreview(null); setValue("image_path", null); }} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow" aria-label="Hapus gambar">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Tambah gambar pendukung
          </Button>
        )}
      </div>

      {usesOptions && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            {type === "tf_grid" ? "Pernyataan" : type === "matching" ? "Pasangan" : type === "ordering" ? "Item (urutan benar)" : "Opsi jawaban"}
            <span className="ml-1 font-normal text-slate-500">— {OPTION_HELP[type]}</span>
          </p>
          <div className="space-y-2">
            {options.fields.map((f, i) => {
              const correct = optionValues?.[i]?.is_correct ?? false;
              const isChoice = type === "multiple_choice" || type === "multiple_select" || type === "true_false";
              const Icon = type === "multiple_select" ? (correct ? SquareCheck : Square) : correct ? CheckCircle2 : Circle;
              return (
                <div key={f.id} className={cn("flex flex-wrap items-center gap-2 rounded-xl border p-1.5 pl-2 transition sm:flex-nowrap",
                  isChoice && correct ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200")}>
                  {isChoice && (
                    <button type="button" onClick={() => markCorrect(i)} aria-label={`Tandai opsi ${i + 1} benar`} className={cn("shrink-0", correct ? "text-emerald-600" : "text-slate-300 hover:text-slate-500")}>
                      <Icon className="h-6 w-6" />
                    </button>
                  )}
                  <span className="w-5 text-center text-xs font-bold text-slate-400">{type === "ordering" ? i + 1 : String.fromCharCode(65 + i)}</span>
                  <Controller
                    control={control}
                    name={`options.${i}.label`}
                    render={({ field }) => (
                      <Input {...field} readOnly={type === "true_false"} className="h-9 min-w-0 flex-1 border-0 bg-transparent focus:ring-0"
                        placeholder={type === "tf_grid" ? `Pernyataan ${i + 1}` : type === "matching" ? "Sisi kiri" : `Opsi ${i + 1}`} aria-label={`Teks ${i + 1}`} />
                    )}
                  />
                  {type === "matching" && (
                    <>
                      <span className="text-slate-400" aria-hidden>↔</span>
                      <Controller control={control} name={`options.${i}.match_text`}
                        render={({ field }) => <Input {...field} value={field.value ?? ""} className="h-9 min-w-0 flex-1" placeholder="Pasangan (kanan)" aria-label={`Pasangan ${i + 1}`} />} />
                    </>
                  )}
                  {type === "tf_grid" && (
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold" role="radiogroup" aria-label={`Kunci pernyataan ${i + 1}`}>
                      <button type="button" role="radio" aria-checked={correct} onClick={() => setValue(`options.${i}.is_correct`, true, { shouldDirty: true })}
                        className={cn("px-3 py-1.5", correct ? "bg-emerald-600 text-white" : "bg-white text-slate-500")}>Benar</button>
                      <button type="button" role="radio" aria-checked={!correct} onClick={() => setValue(`options.${i}.is_correct`, false, { shouldDirty: true })}
                        className={cn("px-3 py-1.5", !correct ? "bg-rose-500 text-white" : "bg-white text-slate-500")}>Salah</button>
                    </div>
                  )}
                  {type === "ordering" && (
                    <div className="flex shrink-0">
                      <button type="button" onClick={() => i > 0 && options.swap(i, i - 1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Naikkan"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => i < options.fields.length - 1 && options.swap(i, i + 1)} disabled={i === options.fields.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Turunkan"><ArrowDown className="h-4 w-4" /></button>
                    </div>
                  )}
                  {type !== "true_false" && options.fields.length > 2 && (
                    <button type="button" onClick={() => options.remove(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`Hapus ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(optionError?.message || optionError?.root?.message) && <p className="mt-1 text-xs text-rose-600">{optionError.message ?? optionError.root?.message}</p>}
          {Array.isArray(errors.options) && errors.options.some(Boolean) && <p className="mt-1 text-xs text-rose-600">Lengkapi teks setiap baris</p>}
          {type !== "true_false" && options.fields.length < 10 && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => options.append({ id: "", label: "", is_correct: false, match_text: "" })}>
              <Plus className="h-4 w-4" /> Tambah {type === "tf_grid" ? "pernyataan" : type === "matching" ? "pasangan" : type === "ordering" ? "item" : "opsi"}
            </Button>
          )}
        </div>
      )}

      {KEYED_TEXT_TYPES.has(type) && (
        <div className="space-y-3">
          <Field label="Kunci jawaban yang diterima" htmlFor="answers" error={errors.accepted_answers?.message as string | undefined} hint="Satu jawaban per baris. Spasi berlebih diabaikan.">
            <Textarea id="answers" rows={3} value={answersText} onChange={(e) => setAnswersText(e.target.value)} placeholder={"Jakarta\nDKI Jakarta"} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Controller control={control} name="case_sensitive" render={({ field }) => <Toggle checked={!!field.value} onChange={field.onChange} label="Peka huruf besar/kecil" />} />
            <Controller control={control} name="manual_grading" render={({ field }) => <Toggle checked={!!field.value} onChange={field.onChange} label="Koreksi manual" description="Jawaban yang tidak cocok dinilai guru" />} />
          </div>
        </div>
      )}

      {type === "essay" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-violet-900">Rubrik penilaian</p>
            <span className={cn("text-xs font-medium", rubricTotal > 0 && rubricTotal !== points ? "text-amber-700" : "text-violet-700")}>
              Total {rubricTotal} / bobot {points}{rubricTotal > 0 && rubricTotal !== points ? " — sebaiknya sama" : ""}
            </span>
          </div>
          <p className="mb-3 text-xs text-violet-700">Uraian selalu dikoreksi guru. Rubrik ditampilkan ke siswa sebagai panduan dan ke guru saat menilai.</p>
          <div className="space-y-2">
            {rubric.fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <Input {...register(`payload.rubric.${i}.criterion`)} placeholder={`Kriteria ${i + 1}`} className="h-9 flex-1 bg-white" aria-label={`Kriteria ${i + 1}`} />
                <Input {...register(`payload.rubric.${i}.points`)} type="number" min={0} step="0.5" className="h-9 w-24 bg-white" aria-label={`Poin kriteria ${i + 1}`} />
                <button type="button" onClick={() => rubric.remove(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`Hapus kriteria ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {rubric.fields.length < 10 && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => rubric.append({ criterion: "", points: 0 })}>
              <Plus className="h-4 w-4" /> Tambah kriteria
            </Button>
          )}
        </div>
      )}

      {type === "word_cloud" && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Siswa menjawab singkat (maks. 60 karakter). Hasilnya tampil sebagai word cloud di tab Analisis.</p>
      )}

      {!SURVEY_TYPES.has(type) && type !== "essay" && (
        <Field label="Petunjuk (power-up, opsional)" htmlFor="hint" hint="Hanya muncul bila power-up aktif dan siswa memakai “Petunjuk”.">
          <div className="relative">
            <Lightbulb className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-amber-400" />
            <Input id="hint" className="pl-10" {...register("payload.hint")} placeholder="Ingat rumus luas segitiga…" maxLength={1000} />
          </div>
        </Field>
      )}

      {!SURVEY_TYPES.has(type) && (
        <Field label="Pembahasan (opsional)" htmlFor="explanation">
          <Textarea id="explanation" rows={3} {...register("explanation")} placeholder="Ditampilkan ke siswa setelah mengumpulkan jika diizinkan." />
        </Field>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
        <Button type="submit" loading={pending || uploading}>{initial ? "Simpan perubahan" : "Tambah soal"}</Button>
      </div>
    </form>
  );
}
