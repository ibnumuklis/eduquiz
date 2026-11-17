import type { ZodError } from "zod";
import type { ActionResult } from "@/types";

interface DbError {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
}

/** Map database / PostgREST errors to safe, user-facing Indonesian messages. */
export function dbErrorMessage(error: DbError | null | undefined): string {
  if (!error) return "Terjadi kesalahan yang tidak diketahui";
  // Errors raised by our RPCs carry a machine code in `hint` and a friendly message.
  if (error.code === "P0001" && error.message) return error.message;
  switch (error.code) {
    case "42501":
      return "Anda tidak memiliki akses untuk melakukan tindakan ini";
    case "23505":
      return "Data yang sama sudah ada";
    case "23503":
      return "Data masih digunakan atau referensi tidak valid";
    case "23514":
      return "Data tidak memenuhi aturan validasi";
    case "PGRST116":
      return "Data tidak ditemukan";
    case "PGRST301":
    case "PGRST302":
      return "Sesi Anda telah berakhir, silakan login ulang";
  }
  if (error.message?.includes("row-level security")) return "Anda tidak memiliki akses untuk melakukan tindakan ini";
  if (error.message?.includes("Failed to fetch") || error.message?.includes("fetch failed"))
    return "Koneksi ke server terputus. Periksa internet Anda lalu coba lagi.";
  return "Terjadi kesalahan pada server. Silakan coba lagi.";
}

export function fail(error: DbError | string): ActionResult<never> {
  return { ok: false, error: typeof error === "string" ? error : dbErrorMessage(error) };
}

export function invalid(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: error.issues[0]?.message ?? "Input tidak valid", fieldErrors };
}
