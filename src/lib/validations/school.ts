import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;

export const createSchoolSchema = z.object({
  name: z.string().trim().min(3, "Nama sekolah minimal 3 karakter").max(150),
  address: optionalText(300),
  email: z.union([z.literal(""), z.string().trim().email("Email tidak valid")]).optional().transform((v) => v || null),
  phone: optionalText(20),
  timezone: z.enum(TIMEZONES).default("Asia/Jakarta"),
});

export const schoolSettingsSchema = createSchoolSchema.extend({
  academic_year: z
    .string()
    .trim()
    .regex(/^(\d{4}\/\d{4})?$/, "Format tahun ajaran: 2026/2027")
    .optional()
    .transform((v) => v || null),
  semester: z.enum(["", "ganjil", "genap"]).optional().transform((v) => v || null),
  leaderboard_enabled: z.coerce.boolean(),
  leaderboard_show_names: z.coerce.boolean(),
});

export const inviteCodeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/, "Kode undangan terdiri dari 8 karakter"),
});

export const invitationSchema = z.object({
  role: z.enum(["school_admin", "teacher", "student"]),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Email tidak valid")]).optional().transform((v) => v || null),
  full_name: optionalText(120),
  student_number: optionalText(30),
  class_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
  max_uses: z.coerce.number().int().min(1).max(1000).default(1),
  valid_days: z.coerce.number().int().min(1).max(90).default(14),
});

export const classSchema = z.object({
  name: z.string().trim().min(1, "Nama kelas wajib diisi").max(80),
  grade_level: optionalText(20),
  academic_year: optionalText(20),
  homeroom_teacher_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => v || null),
});

export const subjectSchema = z.object({
  name: z.string().trim().min(2, "Nama mata pelajaran minimal 2 karakter").max(80),
  code: optionalText(20),
});

export const importRowSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  full_name: z.string().trim().min(2, "Nama wajib diisi").max(120),
  student_number: z.string().trim().max(30).optional().default(""),
  class_name: z.string().trim().max(80).optional().default(""),
});
