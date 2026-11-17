import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Format email tidak valid").max(254);

export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter")
  .regex(/[A-Za-z]/, "Password harus mengandung huruf")
  .regex(/[0-9]/, "Password harus mengandung angka");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi"),
});

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120),
    email: emailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, { message: "Konfirmasi password tidak sama", path: ["confirm_password"] });

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z
  .object({ password: passwordSchema, confirm_password: z.string() })
  .refine((v) => v.password === v.confirm_password, { message: "Konfirmasi password tidak sama", path: ["confirm_password"] });

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s]*$/, "Nomor telepon tidak valid")
    .optional()
    .transform((v) => v || null),
});
