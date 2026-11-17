"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { forgotSchema, loginSchema, profileSchema, registerSchema, resetSchema } from "@/lib/validations/auth";
import { invalid } from "@/lib/utils/errors";
import { safeRedirect } from "@/lib/utils";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/permissions/session";
import type { ActionResult } from "@/types";

function authMessage(message: string | undefined) {
  if (!message) return "Terjadi kesalahan. Coba lagi.";
  if (/invalid login credentials/i.test(message)) return "Email atau password salah";
  if (/email not confirmed/i.test(message)) return "Email belum diverifikasi. Cek kotak masuk Anda.";
  if (/already registered|already been registered/i.test(message)) return "Email sudah terdaftar. Silakan login.";
  if (/rate limit|too many/i.test(message)) return "Terlalu banyak percobaan. Tunggu beberapa menit.";
  if (/same.*password|different from the old/i.test(message)) return "Password baru harus berbeda dari password lama";
  if (/weak|pwned/i.test(message)) return "Password terlalu lemah atau pernah bocor. Gunakan password lain.";
  return "Terjadi kesalahan autentikasi. Coba lagi.";
}

export async function signIn(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/email not confirmed/i.test(error.message)) redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    return { ok: false, error: authMessage(error.message) };
  }
  await supabase.rpc("accept_pending_invitations");
  redirect(safeRedirect(formData.get("next")?.toString()));
}

export async function signUp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const invite = formData.get("invite")?.toString().trim().toUpperCase() || "";
  const next = invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/onboarding";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { ok: false, error: authMessage(error.message) };
  // Supabase returns a user with no identities when the email already exists.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, error: "Email sudah terdaftar. Silakan login." };
  }
  if (data.session) {
    await supabase.rpc("accept_pending_invitations");
    redirect(next);
  }
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function resendVerification(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/onboarding` },
  });
  if (error) return { ok: false, error: authMessage(error.message) };
  return { ok: true, message: "Email verifikasi telah dikirim ulang." };
}

export async function requestPasswordReset(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Always the same response: never reveal whether an email is registered.
  return { ok: true, message: "Jika email terdaftar, tautan reset password telah dikirim." };
}

export async function resetPassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Tautan reset sudah tidak berlaku. Minta tautan baru." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authMessage(error.message) };
  redirect("/dashboard?reset=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_SCHOOL_COOKIE);
  redirect("/login");
}

export async function updateProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sesi berakhir, silakan login ulang" };
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", auth.user.id);
  if (error) return { ok: false, error: "Gagal menyimpan profil" };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil berhasil disimpan" };
}

export async function changePassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const current = formData.get("current_password")?.toString() ?? "";
  const parsed = resetSchema.safeParse({ password: formData.get("password"), confirm_password: formData.get("confirm_password") });
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { ok: false, error: "Sesi berakhir, silakan login ulang" };
  // Re-authenticate before changing the password.
  const { error: reauth } = await supabase.auth.signInWithPassword({ email: auth.user.email, password: current });
  if (reauth) return { ok: false, error: "Password saat ini salah" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authMessage(error.message) };
  return { ok: true, message: "Password berhasil diubah" };
}

export async function switchSchool(schoolId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("school_members").select("school_id").eq("school_id", schoolId).maybeSingle();
  if (!data) return;
  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, schoolId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
