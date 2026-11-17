"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Circle, ImagePlus, Plus, Square, SquareCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { saveQuestion } from "@/features/quizzes/actions";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES, questionSchema, type QuestionInput } from "@/lib/validations/quiz";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { QuestionType } from "@/types";

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
  question_options: { id: string; label: string; is_correct: boolean }[];
}

const TF_OPTIONS = [
  { id: "", label: "Benar", is_correct: true },
  { id: "", label: "Salah", is_correct: false },
];
const DEFAULT_OPTIONS = [
  { id: "", label: "", is_correct: true },
  { id: "", label: "", is_correct: false },
  { id: "", label: "", is_correct: false },
  { id: "", label: "", is_correct: false },
];
const MAX_IMAGE = 5 * 1024 * 1024;

export function QuestionEditor({
  quizId,
  schoolId,
  initial,
  onSaved,
  onCancel,
}: {
  quizId: string;
  schoolId: string;
  initial: EditableQuestion | null;
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
      options: initial?.question_options.length ? initial.question_options.map((o) => ({ id: o.id, label: o.label, is_correct: o.is_correct })) : DEFAULT_OPTIONS,
      accepted_answers: initial?.accepted_answers ?? [],
      case_sensitive: initial?.case_sensitive ?? false,
      manual_grading: initial?.manual_grading ?? false,
    },
  });
  const { register, control, setValue, handleSubmit, formState: { errors } } = form;
  const options = useFieldArray({ control, name: "options" });
  const type = useWatch({ control, name: "type" });
  const optionValues = useWatch({ control, name: "options" });
  const isChoice = type === "multiple_choice" || type === "multiple_select" || type === "true_false";
  const [answersText, setAnswersText] = useState((initial?.accepted_answers ?? []).join("\n"));

  // Keep option set consistent with the chosen type.
  const prevType = useRef(type);
  useEffect(() => {
    if (prevType.current === type) return;
    const from = prevType.current;
    prevType.current = type;
    if (type === "true_false") options.replace(TF_OPTIONS);
    else if (from === "true_false" || !isChoice) {
      if (isChoice) options.replace(DEFAULT_OPTIONS);
    }
    if (type === "multiple_choice") {
      const current = form.getValues("options") ?? [];
      const firstCorrect = current.findIndex((o) => o.is_correct);
      current.forEach((_, i) => setValue(`options.${i}.is_correct`, i === Math.max(0, firstCorrect)));
    }
  }, [type, isChoice, options, form, setValue]);

  function markCorrect(index: number) {
    const current = form.getValues("options") ?? [];
    if (type === "multiple_select") setValue(`options.${index}.is_correct`, !current[index].is_correct, { shouldDirty: true });
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
        options: isChoice ? values.options : [],
        accepted_answers: isChoice ? [] : answersText.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      const r = await saveQuestion(quizId, initial?.id ?? null, payload);
      if (r.ok) {
        toast.success(r.message ?? "Tersimpan");
        onSaved();
      } else toast.error(r.error);
    }),
  );

  const optionError = (errors.options as { message?: string; root?: { message?: string } } | undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Tipe soal" htmlFor="type">
          <Select id="type" {...register("type")}>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Bobot nilai" htmlFor="points" error={errors.points?.message}>
          <Input id="points" type="number" step="0.5" min={0.5} max={1000} {...register("points")} />
        </Field>
      </div>

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

      {isChoice ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Opsi jawaban <span className="font-normal text-slate-500">— klik ikon untuk menandai {type === "multiple_select" ? "semua jawaban benar" : "jawaban benar"}</span>
          </p>
          <div className="space-y-2">
            {options.fields.map((f, i) => {
              const correct = optionValues?.[i]?.is_correct ?? false;
              const Icon = type === "multiple_select" ? (correct ? SquareCheck : Square) : correct ? CheckCircle2 : Circle;
              return (
                <div key={f.id} className={cn("flex items-center gap-2 rounded-xl border p-1.5 pl-2 transition", correct ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200")}>
                  <button type="button" onClick={() => markCorrect(i)} aria-label={`Tandai opsi ${i + 1} benar`} className={cn("shrink-0", correct ? "text-emerald-600" : "text-slate-300 hover:text-slate-500")}>
                    <Icon className="h-6 w-6" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-slate-400">{String.fromCharCode(65 + i)}</span>
                  <Controller
                    control={control}
                    name={`options.${i}.label`}
                    render={({ field }) => (
                      <Input {...field} readOnly={type === "true_false"} className="h-9 border-0 bg-transparent focus:ring-0" placeholder={`Opsi ${String.fromCharCode(65 + i)}`} aria-label={`Teks opsi ${i + 1}`} />
                    )}
                  />
                  {type !== "true_false" && options.fields.length > 2 && (
                    <button type="button" onClick={() => options.remove(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`Hapus opsi ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(optionError?.message || optionError?.root?.message) && <p className="mt-1 text-xs text-rose-600">{optionError.message ?? optionError.root?.message}</p>}
          {Array.isArray(errors.options) && errors.options.some(Boolean) && <p className="mt-1 text-xs text-rose-600">Lengkapi teks setiap opsi</p>}
          {type !== "true_false" && options.fields.length < 10 && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => options.append({ id: "", label: "", is_correct: false })}>
              <Plus className="h-4 w-4" /> Tambah opsi
            </Button>
          )}
        </div>
      ) : (
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

      <Field label="Pembahasan (opsional)" htmlFor="explanation">
        <Textarea id="explanation" rows={3} {...register("explanation")} placeholder="Ditampilkan ke siswa setelah mengumpulkan jika diizinkan." />
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
        <Button type="submit" loading={pending || uploading}>{initial ? "Simpan perubahan" : "Tambah soal"}</Button>
      </div>
    </form>
  );
}
