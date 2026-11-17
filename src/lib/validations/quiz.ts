import { z } from "zod";

export const QUESTION_TYPES = ["multiple_choice", "multiple_select", "true_false", "short_answer", "fill_blank"] as const;

export const QUESTION_TYPE_LABEL: Record<(typeof QUESTION_TYPES)[number], string> = {
  multiple_choice: "Pilihan ganda",
  multiple_select: "Pilihan ganda kompleks",
  true_false: "Benar / Salah",
  short_answer: "Jawaban singkat",
  fill_blank: "Isian singkat",
};

const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

export const quizSettingsSchema = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 karakter").max(150),
    description: z.string().trim().max(2000).optional().transform((v) => v || null),
    subject_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
    access: z.enum(["assigned", "code", "both"]),
    duration_minutes: z.coerce.number().int("Durasi harus bilangan bulat").min(1, "Durasi minimal 1 menit").max(600, "Durasi maksimal 600 menit"),
    start_at: z.string().optional().transform((v) => v || null),
    end_at: z.string().optional().transform((v) => v || null),
    max_attempts: z.coerce.number().int().min(1).max(20),
    passing_grade: z.coerce.number().min(0).max(100),
    shuffle_questions: bool,
    shuffle_options: bool,
    show_result: bool,
    show_explanation: bool,
  })
  .refine((v) => !v.start_at || !v.end_at || new Date(v.end_at) > new Date(v.start_at), {
    message: "Tanggal selesai harus setelah tanggal mulai",
    path: ["end_at"],
  });

export type QuizSettingsInput = z.input<typeof quizSettingsSchema>;

export const optionSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  label: z.string().trim().min(1, "Teks opsi wajib diisi").max(1000),
  is_correct: z.boolean(),
});

export const questionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, "Pertanyaan wajib diisi").max(5000),
    points: z.coerce.number().positive("Bobot harus lebih dari 0").max(1000),
    explanation: z.string().trim().max(5000).optional().default(""),
    image_path: z.string().max(500).nullable().optional(),
    options: z.array(optionSchema).max(10).default([]),
    accepted_answers: z.array(z.string().trim().max(500)).max(20).default([]),
    case_sensitive: z.boolean().default(false),
    manual_grading: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    const choice = q.type === "multiple_choice" || q.type === "multiple_select" || q.type === "true_false";
    if (choice) {
      if (q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Minimal 2 opsi jawaban" });
      const correct = q.options.filter((o) => o.is_correct).length;
      if (q.type !== "multiple_select" && correct !== 1) ctx.addIssue({ code: "custom", path: ["options"], message: "Tandai tepat satu jawaban benar" });
      if (q.type === "multiple_select" && correct < 1) ctx.addIssue({ code: "custom", path: ["options"], message: "Tandai minimal satu jawaban benar" });
    } else if (!q.manual_grading && q.accepted_answers.filter(Boolean).length === 0) {
      ctx.addIssue({ code: "custom", path: ["accepted_answers"], message: "Isi kunci jawaban atau aktifkan penilaian manual" });
    }
  });

export type QuestionInput = z.input<typeof questionSchema>;
