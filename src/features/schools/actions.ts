"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/env";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/permissions/session";
import { actionErrorMessage, authorize } from "@/lib/permissions/action";
import {
  classSchema, createSchoolSchema, importRowSchema, invitationSchema, inviteCodeSchema, schoolSettingsSchema, subjectSchema,
} from "@/lib/validations/school";
import { fail, invalid } from "@/lib/utils/errors";
import type { ActionResult, MemberRole } from "@/types";

async function setActiveSchool(id: string) {
  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 31536000 });
}

// ---------- Onboarding ----------------------------------------------------
export async function createSchool(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = createSchoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_school", {
    p_name: parsed.data.name, p_address: parsed.data.address, p_email: parsed.data.email,
    p_phone: parsed.data.phone, p_timezone: parsed.data.timezone,
  });
  if (error) return fail(error);
  await setActiveSchool(data as string);
  redirect("/school?welcome=1");
}

export async function joinWithInvitation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = inviteCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_code: parsed.data.code });
  if (error) return fail(error);
  await setActiveSchool(data as string);
  redirect("/dashboard");
}

// ---------- School settings ----------------------------------------------
export async function updateSchoolSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const raw = Object.fromEntries(formData);
    const parsed = schoolSettingsSchema.safeParse({
      ...raw,
      leaderboard_enabled: raw.leaderboard_enabled === "on",
      leaderboard_show_names: raw.leaderboard_show_names === "on",
    });
    if (!parsed.success) return invalid(parsed.error);
    const { error } = await supabase.from("schools").update(parsed.data).eq("id", session.schoolId);
    if (error) return fail(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Pengaturan sekolah disimpan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Invitations ------------------------------------------------------
export async function createInvitation(_: ActionResult<{ code: string }> | null, formData: FormData): Promise<ActionResult<{ code: string }>> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const parsed = invitationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return invalid(parsed.error);
    const d = parsed.data;
    const { data, error } = await supabase
      .rpc("create_invitation", {
        p_school: session.schoolId, p_role: d.role, p_email: d.email, p_full_name: d.full_name,
        p_student_number: d.student_number, p_class: d.class_id, p_max_uses: d.email ? 1 : d.max_uses, p_valid_days: d.valid_days,
      })
      .single();
    if (error) return fail(error);
    const code = (data as { code: string }).code;

    // Optional: send a Supabase Auth invite email when the service key is configured.
    let emailed = false;
    if (d.email && formData.get("send_email") === "on") {
      const adminClient = createAdminClient();
      if (adminClient) {
        const { error: mailError } = await adminClient.auth.admin.inviteUserByEmail(d.email, {
          redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(`/onboarding?invite=${code}`)}`,
          data: { full_name: d.full_name ?? undefined },
        });
        emailed = !mailError;
      }
    }
    revalidatePath("/school/invitations");
    return { ok: true, data: { code }, message: emailed ? "Undangan dibuat dan email terkirim" : "Undangan dibuat" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const { error } = await supabase
      .from("school_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("school_id", session.schoolId);
    if (error) return fail(error);
    revalidatePath("/school/invitations");
    return { ok: true, message: "Undangan dicabut" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export interface ImportReport {
  imported: number;
  failed: number;
  rows: { row: number; email: string; ok: boolean; code?: string; error?: string }[];
}

export async function importStudents(rows: unknown[]): Promise<ActionResult<ImportReport>> {
  try {
    const { session, supabase } = await authorize("school_admin");
    if (!Array.isArray(rows) || rows.length === 0) return fail("File tidak berisi data");
    if (rows.length > 1000) return fail("Maksimal 1000 baris per impor");
    // Client-side shape validation first; the database re-validates every row.
    const prepared = rows.map((r) => {
      const p = importRowSchema.safeParse(r);
      return p.success ? p.data : { email: String((r as Record<string, unknown>)?.email ?? ""), full_name: "", student_number: "", class_name: "" };
    });
    const { data, error } = await supabase.rpc("import_students", { p_school: session.schoolId, p_rows: prepared });
    if (error) return fail(error);
    revalidatePath("/school/invitations");
    revalidatePath("/school/students");
    return { ok: true, data: data as ImportReport };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Members ----------------------------------------------------------
export async function updateMember(memberId: string, patch: { role?: MemberRole; status?: "active" | "disabled"; student_number?: string | null }): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const allowed: Record<string, unknown> = {};
    if (patch.role && ["school_admin", "teacher", "student"].includes(patch.role)) allowed.role = patch.role;
    if (patch.status && ["active", "disabled"].includes(patch.status)) allowed.status = patch.status;
    if (patch.student_number !== undefined) allowed.student_number = patch.student_number?.trim() || null;
    const { data, error } = await supabase
      .from("school_members")
      .update(allowed)
      .eq("id", memberId)
      .eq("school_id", session.schoolId)
      .select("id");
    if (error) return fail(error);
    if (!data?.length) return fail("Anggota tidak ditemukan atau Anda tidak dapat mengubah akun sendiri");
    revalidatePath("/school", "layout");
    return { ok: true, message: "Data anggota diperbarui" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const { data, error } = await supabase.from("school_members").delete().eq("id", memberId).eq("school_id", session.schoolId).select("id");
    if (error) return fail(error);
    if (!data?.length) return fail("Anggota tidak ditemukan");
    revalidatePath("/school", "layout");
    return { ok: true, message: "Anggota dikeluarkan dari sekolah" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Classes ------------------------------------------------------------
export async function saveClass(id: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const parsed = classSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return invalid(parsed.error);
    const { error } = id
      ? await supabase.from("classes").update(parsed.data).eq("id", id).eq("school_id", session.schoolId)
      : await supabase.from("classes").insert({ ...parsed.data, school_id: session.schoolId });
    if (error) return fail(error);
    revalidatePath("/school/classes");
    return { ok: true, message: id ? "Kelas diperbarui" : "Kelas ditambahkan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function deleteClass(id: string): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const { error } = await supabase.from("classes").delete().eq("id", id).eq("school_id", session.schoolId);
    if (error) return fail(error);
    revalidatePath("/school/classes");
    return { ok: true, message: "Kelas dihapus" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function addStudentsToClass(classId: string, studentIds: string[]): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    if (!studentIds.length) return fail("Pilih minimal satu siswa");
    const { error } = await supabase
      .from("class_students")
      .upsert(studentIds.map((sid) => ({ class_id: classId, student_id: sid, school_id: session.schoolId })), {
        onConflict: "class_id,student_id",
        ignoreDuplicates: true,
      });
    if (error) return fail(error);
    revalidatePath(`/school/classes/${classId}`);
    return { ok: true, message: `${studentIds.length} siswa ditambahkan` };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function removeStudentFromClass(classId: string, studentId: string): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("school_admin");
    const { error } = await supabase.from("class_students").delete().eq("class_id", classId).eq("student_id", studentId);
    if (error) return fail(error);
    revalidatePath(`/school/classes/${classId}`);
    return { ok: true, message: "Siswa dikeluarkan dari kelas" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Subjects & teaching assignments ------------------------------------
export async function saveSubject(id: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const parsed = subjectSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return invalid(parsed.error);
    const { error } = id
      ? await supabase.from("subjects").update(parsed.data).eq("id", id).eq("school_id", session.schoolId)
      : await supabase.from("subjects").insert({ ...parsed.data, school_id: session.schoolId });
    if (error) return fail(error);
    revalidatePath("/school/subjects");
    return { ok: true, message: id ? "Mata pelajaran diperbarui" : "Mata pelajaran ditambahkan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const { error } = await supabase.from("subjects").delete().eq("id", id).eq("school_id", session.schoolId);
    if (error) return fail(error);
    revalidatePath("/school/subjects");
    return { ok: true, message: "Mata pelajaran dihapus" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function assignTeaching(teacherId: string, subjectId: string, classId: string): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const { error } = await supabase
      .from("teacher_subjects")
      .insert({ school_id: session.schoolId, teacher_id: teacherId, subject_id: subjectId, class_id: classId });
    if (error) return fail(error);
    revalidatePath("/school/teachers");
    return { ok: true, message: "Penugasan mengajar ditambahkan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function removeTeaching(id: string): Promise<ActionResult> {
  try {
    const { session, supabase } = await authorize("school_admin");
    const { error } = await supabase.from("teacher_subjects").delete().eq("id", id).eq("school_id", session.schoolId);
    if (error) return fail(error);
    revalidatePath("/school/teachers");
    return { ok: true, message: "Penugasan dihapus" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

// ---------- Super admin -------------------------------------------------------
export async function setSchoolStatus(schoolId: string, status: "active" | "inactive"): Promise<ActionResult> {
  try {
    const { supabase } = await authorize("super_admin");
    const { error } = await supabase.rpc("set_school_status", { p_school: schoolId, p_status: status });
    if (error) return fail(error);
    revalidatePath("/admin/schools");
    return { ok: true, message: status === "active" ? "Sekolah diaktifkan" : "Sekolah dinonaktifkan" };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}

export async function assignSchoolAdmin(schoolId: string, email: string): Promise<ActionResult<{ result: string }>> {
  try {
    const { supabase } = await authorize("super_admin");
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return fail("Email tidak valid");
    const { data, error } = await supabase.rpc("assign_school_admin", { p_school: schoolId, p_email: clean });
    if (error) return fail(error);
    const result = String(data);
    revalidatePath("/admin/schools");
    return {
      ok: true,
      data: { result },
      message: result.startsWith("invited:") ? `Akun belum ada — kode undangan admin: ${result.slice(8)}` : "Administrator ditetapkan",
    };
  } catch (e) {
    return fail(actionErrorMessage(e));
  }
}
