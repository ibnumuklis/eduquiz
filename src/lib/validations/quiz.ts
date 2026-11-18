import { z } from "zod";

export const QUESTION_TYPES = [
  "multiple_choice", "multiple_select", "true_false", "tf_grid", "matching", "ordering",
  "short_answer", "fill_blank", "essay", "poll", "word_cloud",
] as const;
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionTypeValue, string> = {
  multiple_choice: "Pilihan ganda",
  multiple_select: "Pilihan ganda kompleks",
  true_false: "Benar / Salah",
  tf_grid: "PGK Benar/Salah (grid)",
  matching: "Menjodohkan",
  ordering: "Mengurutkan",
  short_answer: "Jawaban singkat",
  fill_blank: "Isian rumpang",
  essay: "Uraian (rubrik)",
  poll: "Polling (tidak dinilai)",
  word_cloud: "Word cloud (tidak dinilai)",
};

export const QUESTION_TYPE_GROUPS: { label: string; types: QuestionTypeValue[] }[] = [
  { label: "Pilihan", types: ["multiple_choice", "multiple_select", "true_false"] },
  { label: "Format AKM", types: ["tf_grid", "matching", "ordering"] },
  { label: "Isian & uraian", types: ["short_answer", "fill_blank", "essay"] },
  { label: "Survei kelas", types: ["poll", "word_cloud"] },
];

/** Types whose answers use the option list. */
export const OPTION_TYPES: ReadonlySet<string> = new Set(["multiple_choice", "multiple_select", "true_false", "poll", "tf_grid", "matching", "ordering"]);
/** Types that are never scored. */
export const SURVEY_TYPES: ReadonlySet<string> = new Set(["poll", "word_cloud"]);
/** Types with typed text answers that use an answer key. */
export const KEYED_TEXT_TYPES: ReadonlySet<string> = new Set(["short_answer", "fill_blank"]);

export const QUIZ_MODES = ["standard", "practice", "exam"] as const;
export const QUIZ_MODE_META: Record<(typeof QUIZ_MODES)[number], { label: string; description: string }> = {
  standard: { label: "Standar", description: "Kuis biasa dengan XP, pencapaian, dan leaderboard." },
  practice: { label: "Latihan / Tuntas", description: "Siswa mengulang soal yang salah sampai mencapai target penguasaan." },
  exam: { label: "Ujian", description: "Tanpa gamifikasi & power-up, cocok untuk penilaian sumatif." },
};

export const QUIZ_THEMES = ["default", "batik", "nusantara", "angkasa", "laut", "hutan"] as const;
export const QUIZ_THEME_LABEL: Record<(typeof QUIZ_THEMES)[number], string> = {
  default: "EDUQUIZ (bawaan)",
  batik: "Batik",
  nusantara: "Nusantara",
  angkasa: "Luar angkasa",
  laut: "Bawah laut",
  hutan: "Hutan tropis",
};

const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

export const quizSettingsSchema = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 karakter").max(150),
    description: z.string().trim().max(2000).optional().transform((v) => v || null),
    subject_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
    folder_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
    access: z.enum(["assigned", "code", "both"]),
    duration_minutes: z.coerce.number().int("Durasi harus bilangan bulat").min(1, "Durasi minimal 1 menit").max(600, "Durasi maksimal 600 menit"),
    start_at: z.string().optional().transform((v) => v || null),
    end_at: z.string().optional().transform((v) => v || null),
    max_attempts: z.coerce.number().int().min(1).max(20),
    passing_grade: z.coerce.number().min(0).max(100),
    mode: z.enum(QUIZ_MODES).default("standard"),
    mastery_target: z.coerce.number().min(0).max(100).default(80),
    theme: z.enum(QUIZ_THEMES).default("default"),
    shuffle_questions: bool,
    shuffle_options: bool,
    show_result: bool,
    show_explanation: bool,
    require_fullscreen: bool,
    detect_tab_switch: bool,
    show_watermark: bool,
    powerups_enabled: bool,
    instant_feedback: bool,
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
  match_text: z.string().trim().max(1000).optional().default(""),
});

export const rubricItemSchema = z.object({
  criterion: z.string().trim().max(300),
  points: z.coerce.number().min(0).max(1000),
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
    stimulus_id: z.union([z.literal(""), z.string().uuid()]).nullable().optional().transform((v) => v || null),
    objective_id: z.union([z.literal(""), z.string().uuid()]).nullable().optional().transform((v) => v || null),
    payload: z
      .object({
        hint: z.string().trim().max(1000).optional().default(""),
        rubric: z.array(rubricItemSchema).max(10).optional().default([]),
      })
      .optional()
      .default({ hint: "", rubric: [] }),
  })
  .superRefine((q, ctx) => {
    if (OPTION_TYPES.has(q.type)) {
      const min = 2;
      if (q.options.length < min) {
        const noun = q.type === "tf_grid" ? "pernyataan" : q.type === "matching" ? "pasangan" : q.type === "ordering" ? "item" : "opsi jawaban";
        ctx.addIssue({ code: "custom", path: ["options"], message: `Minimal ${min} ${noun}` });
      }
      const correct = q.options.filter((o) => o.is_correct).length;
      if ((q.type === "multiple_choice" || q.type === "true_false") && correct !== 1)
        ctx.addIssue({ code: "custom", path: ["options"], message: "Tandai tepat satu jawaban benar" });
      if (q.type === "multiple_select" && correct < 1)
        ctx.addIssue({ code: "custom", path: ["options"], message: "Tandai minimal satu jawaban benar" });
      if (q.type === "matching" && q.options.some((o) => !o.match_text?.trim()))
        ctx.addIssue({ code: "custom", path: ["options"], message: "Setiap pasangan harus memiliki jawaban jodohnya" });
    } else if (KEYED_TEXT_TYPES.has(q.type) && !q.manual_grading && q.accepted_answers.filter(Boolean).length === 0) {
      ctx.addIssue({ code: "custom", path: ["accepted_answers"], message: "Isi kunci jawaban atau aktifkan penilaian manual" });
    }
  });

export type QuestionInput = z.input<typeof questionSchema>;
export type QuestionData = z.output<typeof questionSchema>;

export const objectiveSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(30).regex(/^[A-Za-z0-9.\-_/]+$/, "Kode hanya huruf, angka, titik, strip"),
  description: z.string().trim().min(3, "Deskripsi minimal 3 karakter").max(1000),
  subject_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
  phase: z.union([z.literal(""), z.enum(["A", "B", "C", "D", "E", "F"])]).optional().transform((v) => v || null),
  grade_level: z.string().trim().max(30).optional().transform((v) => v || null),
});

export const stimulusSchema = z.object({
  title: z.string().trim().max(200).optional().transform((v) => v || null),
  content: z.string().trim().min(1, "Isi stimulus wajib diisi").max(20000),
  image_path: z.string().max(500).nullable().optional().transform((v) => v || null),
});

export const accommodationSchema = z.object({
  student_id: z.string().uuid(),
  time_multiplier: z.coerce.number().min(1).max(3),
  reduce_options: z.boolean(),
  read_aloud: z.boolean(),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});
