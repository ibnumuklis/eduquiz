/**
 * Creates one test account per role in an isolated "[TEST]" school.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-test-accounts.ts
 *
 * Safety:
 *  - Refuses to run unless EDUQUIZ_ALLOW_TEST_SEED=yes is set explicitly.
 *  - Use a separate Supabase project (staging) whenever possible.
 *  - Accounts use @eduquiz.test emails (reserved TLD, never deliverable) and
 *    live in a school whose name starts with "[TEST]", so they never mix with
 *    real schools. Remove them with:  npx tsx scripts/seed-test-accounts.ts --remove
 *  - Passwords are generated randomly and printed once (or taken from E2E_PASSWORD).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
if (process.env.EDUQUIZ_ALLOW_TEST_SEED !== "yes") {
  throw new Error("Refusing to seed: set EDUQUIZ_ALLOW_TEST_SEED=yes to confirm this is a test/staging project.");
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const SCHOOL_NAME = "[TEST] Sekolah Uji EDUQUIZ";
const ACCOUNTS = [
  { email: "superadmin@eduquiz.test", name: "Super Admin Uji", role: "super_admin" },
  { email: "admin@eduquiz.test", name: "Admin Sekolah Uji", role: "school_admin" },
  { email: "guru@eduquiz.test", name: "Guru Uji", role: "teacher" },
  { email: "siswa@eduquiz.test", name: "Siswa Uji", role: "student" },
  { email: "siswa2@eduquiz.test", name: "Siswa Uji Dua", role: "student" },
] as const;

async function findUser(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function remove() {
  for (const a of ACCOUNTS) {
    const u = await findUser(a.email);
    if (u) await sb.auth.admin.deleteUser(u.id);
  }
  await sb.from("schools").delete().eq("name", SCHOOL_NAME);
  console.log("Test accounts and school removed.");
}

async function seed() {
  const password = process.env.E2E_PASSWORD ?? `Eq-${randomBytes(9).toString("base64url")}9`;
  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const existing = await findUser(a.email);
    if (existing) {
      await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      ids[a.email] = existing.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { full_name: a.name } });
      if (error) throw error;
      ids[a.email] = data.user.id;
    }
  }
  await sb.from("profiles").update({ is_super_admin: true }).eq("id", ids["superadmin@eduquiz.test"]);

  let { data: school } = await sb.from("schools").select("id").eq("name", SCHOOL_NAME).maybeSingle();
  if (!school) {
    const res = await sb.from("schools").insert({ name: SCHOOL_NAME, slug: `test-sekolah-uji-${randomBytes(3).toString("hex")}`, timezone: "Asia/Makassar", academic_year: "2026/2027", semester: "ganjil" }).select("id").single();
    if (res.error) throw res.error;
    school = res.data;
  }
  const schoolId = school.id as string;
  for (const a of ACCOUNTS.filter((x) => x.role !== "super_admin")) {
    await sb.from("school_members").upsert({ school_id: schoolId, user_id: ids[a.email], role: a.role, status: "active" }, { onConflict: "school_id,user_id" });
  }
  const { data: cls } = await sb.from("classes").upsert({ school_id: schoolId, name: "X Uji", academic_year: "2026/2027" }, { onConflict: "school_id,name,academic_year" }).select("id").single();
  const { data: subj } = await sb.from("subjects").upsert({ school_id: schoolId, name: "Matematika" }, { onConflict: "school_id,name" }).select("id").single();
  for (const email of ["siswa@eduquiz.test", "siswa2@eduquiz.test"]) {
    await sb.from("class_students").upsert({ school_id: schoolId, class_id: cls!.id, student_id: ids[email] }, { onConflict: "class_id,student_id" });
  }
  await sb.from("teacher_subjects").upsert({ school_id: schoolId, teacher_id: ids["guru@eduquiz.test"], subject_id: subj!.id, class_id: cls!.id }, { onConflict: "teacher_id,subject_id,class_id" });

  console.log("\nTest accounts ready (password shown once):");
  console.table(ACCOUNTS.map((a) => ({ role: a.role, email: a.email })));
  console.log(`Password: ${password}\n`);
}

(process.argv.includes("--remove") ? remove() : seed()).catch((e) => {
  console.error(e);
  process.exit(1);
});
