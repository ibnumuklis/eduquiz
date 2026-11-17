import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, as, createUser, pool, rpc } from "./db";

type Id = string;
const u: Record<string, Id> = {};
let schoolA: Id, schoolB: Id, classA1: Id, classA2: Id, classB1: Id, subjectA: Id;
let quiz: Id; // main quiz in school A (teacherA, assigned to classA1)
const q: Record<string, Id> = {};
const opt: Record<string, Id> = {};

async function invite(adminId: Id, school: Id, role: string, email: string | null, cls: Id | null = null) {
  const row = await as<{ code: string }>(
    adminId,
    "select (public.create_invitation($1, $2::public.member_role, $3, null, null, $4)).code as code",
    [school, role, email, cls],
  );
  return row[0].code;
}

async function addQuestion(quizId: Id, owner: Id, type: string, prompt: string, extra: Record<string, unknown> = {}) {
  const rows = await as<{ id: Id }>(
    owner,
    `insert into public.quiz_questions (quiz_id, type, prompt, points, accepted_answers, manual_grading, position, explanation)
     values ($1, $2, $3, $4, $5, $6, $7, 'Pembahasan rahasia') returning id`,
    [quizId, type, prompt, extra.points ?? 10, extra.accepted ?? [], extra.manual ?? false, extra.position ?? 0],
  );
  return rows[0].id;
}
async function addOption(owner: Id, questionId: Id, label: string, correct: boolean) {
  const rows = await as<{ id: Id }>(
    owner,
    "insert into public.question_options (question_id, label, is_correct) values ($1, $2, $3) returning id",
    [questionId, label, correct],
  );
  return rows[0].id;
}

beforeAll(async () => {
  u.super = await createUser("super@eduquiz.test", "Super Admin");
  await admin("update public.profiles set is_super_admin = true where id = $1", [u.super]);
  u.adminA = await createUser("admin.a@eduquiz.test", "Admin A");
  u.teacherA = await createUser("guru.a@eduquiz.test", "Guru A");
  u.teacherA2 = await createUser("guru.a2@eduquiz.test", "Guru A2");
  u.studentA1 = await createUser("siswa.a1@eduquiz.test", "Siswa A1");
  u.studentA2 = await createUser("siswa.a2@eduquiz.test", "Siswa A2");
  u.adminB = await createUser("admin.b@eduquiz.test", "Admin B");
  u.teacherB = await createUser("guru.b@eduquiz.test", "Guru B");
  u.studentB = await createUser("siswa.b@eduquiz.test", "Siswa B");
  u.unverified = await createUser("belum@eduquiz.test", "Belum Verifikasi", false);

  schoolA = await rpc<Id>(u.adminA, "create_school", { p_name: "SMA Negeri 1 Makassar" });
  schoolB = await rpc<Id>(u.adminB, "create_school", { p_name: "SMP Harapan Bangsa" });

  [{ id: classA1 }] = await as<{ id: Id }>(u.adminA, "insert into public.classes (school_id, name) values ($1, 'X IPA 1') returning id", [schoolA]);
  [{ id: classA2 }] = await as<{ id: Id }>(u.adminA, "insert into public.classes (school_id, name) values ($1, 'X IPA 2') returning id", [schoolA]);
  [{ id: classB1 }] = await as<{ id: Id }>(u.adminB, "insert into public.classes (school_id, name) values ($1, 'VII A') returning id", [schoolB]);
  [{ id: subjectA }] = await as<{ id: Id }>(u.adminA, "insert into public.subjects (school_id, name) values ($1, 'Matematika') returning id", [schoolA]);

  await rpc(u.teacherA, "accept_invitation", { p_code: await invite(u.adminA, schoolA, "teacher", "guru.a@eduquiz.test") });
  await rpc(u.teacherA2, "accept_invitation", { p_code: await invite(u.adminA, schoolA, "teacher", null) });
  await rpc(u.studentA1, "accept_invitation", { p_code: await invite(u.adminA, schoolA, "student", null, classA1) });
  await rpc(u.studentA2, "accept_invitation", { p_code: await invite(u.adminA, schoolA, "student", null, classA2) });
  await rpc(u.teacherB, "accept_invitation", { p_code: await invite(u.adminB, schoolB, "teacher", null) });
  await rpc(u.studentB, "accept_invitation", { p_code: await invite(u.adminB, schoolB, "student", null, classB1) });

  await as(u.adminA, "insert into public.teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)", [schoolA, u.teacherA, subjectA, classA1]);

  [{ id: quiz }] = await as<{ id: Id }>(
    u.teacherA,
    `insert into public.quizzes (school_id, teacher_id, subject_id, title, duration_minutes, max_attempts, passing_grade, show_result, show_explanation)
     values ($1, $2, $3, 'Ulangan Harian Aljabar', 30, 2, 70, true, false) returning id`,
    [schoolA, u.teacherA, subjectA],
  );
  q.mc = await addQuestion(quiz, u.teacherA, "multiple_choice", "2 + 2 = ?", { position: 0 });
  opt.mcRight = await addOption(u.teacherA, q.mc, "4", true);
  opt.mcWrong = await addOption(u.teacherA, q.mc, "5", false);
  q.ms = await addQuestion(quiz, u.teacherA, "multiple_select", "Bilangan prima?", { position: 1 });
  opt.ms2 = await addOption(u.teacherA, q.ms, "2", true);
  opt.ms3 = await addOption(u.teacherA, q.ms, "3", true);
  opt.ms4 = await addOption(u.teacherA, q.ms, "4", false);
  q.tf = await addQuestion(quiz, u.teacherA, "true_false", "0 adalah bilangan genap", { position: 2 });
  opt.tfT = await addOption(u.teacherA, q.tf, "Benar", true);
  opt.tfF = await addOption(u.teacherA, q.tf, "Salah", false);
  q.sa = await addQuestion(quiz, u.teacherA, "short_answer", "Ibu kota Sulawesi Selatan?", { position: 3, accepted: ["Makassar"] });
  q.essay = await addQuestion(quiz, u.teacherA, "short_answer", "Jelaskan konsep fungsi", { position: 4, manual: true });
  await as(u.teacherA, "insert into public.quiz_assignments (quiz_id, class_id) values ($1, $2)", [quiz, classA1]);
  await rpc(u.teacherA, "publish_quiz", { p_quiz: quiz });
});

afterAll(async () => {
  await pool.end();
});

describe("Authentication boundary", () => {
  it("anonymous users cannot read any table", async () => {
    await expect(as(null, "select * from public.schools")).rejects.toThrow(/permission denied/);
    await expect(as(null, "select * from public.quiz_questions")).rejects.toThrow(/permission denied/);
  });
  it("anonymous users cannot call RPCs", async () => {
    await expect(rpc(null, "start_attempt", { p_code: "ABCDEF" })).rejects.toThrow(/permission denied/);
  });
});

describe("Privilege escalation", () => {
  it("a user cannot make themselves super admin", async () => {
    await expect(as(u.studentA1, "update public.profiles set is_super_admin = true where id = $1", [u.studentA1])).rejects.toThrow(/permission denied/);
  });
  it("a student cannot change their own XP", async () => {
    await expect(as(u.studentA1, "update public.profiles set xp = 99999 where id = $1", [u.studentA1])).rejects.toThrow(/permission denied/);
  });
  it("a user can update their own name only", async () => {
    await as(u.studentA1, "update public.profiles set full_name = 'Andi Pratama' where id = $1", [u.studentA1]);
    const rows = await as(u.studentA1, "update public.profiles set full_name = 'X' where id = $1 returning id", [u.studentA2]);
    expect(rows).toHaveLength(0);
  });
  it("a student cannot promote their own membership", async () => {
    const rows = await as(u.studentA1, "update public.school_members set role = 'school_admin' where user_id = $1 returning id", [u.studentA1]);
    expect(rows).toHaveLength(0);
  });
  it("a teacher cannot promote themselves", async () => {
    const rows = await as(u.teacherA, "update public.school_members set role = 'school_admin' where user_id = $1 returning id", [u.teacherA]);
    expect(rows).toHaveLength(0);
  });
  it("an admin cannot change their own role", async () => {
    const rows = await as(u.adminA, "update public.school_members set role = 'student' where user_id = $1 returning id", [u.adminA]);
    expect(rows).toHaveLength(0);
  });
  it("only super admin can change school status", async () => {
    await expect(rpc(u.adminA, "set_school_status", { p_school: schoolA, p_status: "inactive" })).rejects.toThrow(/Super Admin/);
    await expect(as(u.adminA, "update public.schools set status = 'inactive' where id = $1", [schoolA])).rejects.toThrow(/permission denied/);
  });
  it("students cannot insert results or modify attempts directly", async () => {
    await expect(
      as(u.studentA1, "insert into public.quiz_results (attempt_id, quiz_id, school_id, student_id, score) values (gen_random_uuid(), $1, $2, $3, 100)", [quiz, schoolA, u.studentA1]),
    ).rejects.toThrow(/permission denied/);
    await expect(as(u.studentA1, "update public.quiz_attempts set status = 'submitted'")).rejects.toThrow(/permission denied/);
    await expect(as(u.studentA1, "insert into public.student_answers (attempt_id, question_id, school_id, student_id) values (gen_random_uuid(), $1, $2, $3)", [q.mc, schoolA, u.studentA1])).rejects.toThrow(/permission denied/);
  });
  it("internal grading functions are not callable by clients", async () => {
    await expect(as(u.studentA1, "select public._finalize_attempt(gen_random_uuid(), false)")).rejects.toThrow(/permission denied/);
    await expect(as(u.studentA1, "select public._award_xp($1, $2, 'quiz', gen_random_uuid(), 1000)", [u.studentA1, schoolA])).rejects.toThrow(/permission denied/);
  });
});

describe("Cross-school isolation", () => {
  it("school B staff cannot see school A data", async () => {
    expect(await as(u.teacherB, "select id from public.quizzes where school_id = $1", [schoolA])).toHaveLength(0);
    expect(await as(u.teacherB, "select id from public.classes where school_id = $1", [schoolA])).toHaveLength(0);
    expect(await as(u.adminB, "select id from public.school_members where school_id = $1", [schoolA])).toHaveLength(0);
    expect(await as(u.adminB, "select id from public.schools where id = $1", [schoolA])).toHaveLength(0);
    expect(await as(u.adminB, "select id from public.profiles where id = $1", [u.studentA1])).toHaveLength(0);
  });
  it("a teacher cannot create a quiz in another school", async () => {
    await expect(
      as(u.teacherA, "insert into public.quizzes (school_id, teacher_id, title) values ($1, $2, 'Hack')", [schoolB, u.teacherA]),
    ).rejects.toThrow(/row-level security/);
  });
  it("a teacher cannot assign a quiz to another school's class", async () => {
    await expect(as(u.teacherA, "insert into public.quiz_assignments (quiz_id, class_id) values ($1, $2)", [quiz, classB1])).rejects.toThrow();
  });
  it("a student from school B cannot start a school A quiz with its code", async () => {
    const [{ access_code }] = await admin<{ access_code: string }>("select access_code from public.quizzes where id = $1", [quiz]);
    await expect(rpc(u.studentB, "start_attempt", { p_code: access_code })).rejects.toThrow(/hanya untuk siswa/);
  });
  it("teacher A2 cannot see or edit teacher A's quiz", async () => {
    expect(await as(u.teacherA2, "select id from public.quizzes where id = $1", [quiz])).toHaveLength(0);
    expect(await as(u.teacherA2, "update public.quizzes set title = 'X' where id = $1 returning id", [quiz])).toHaveLength(0);
    await expect(rpc(u.teacherA2, "get_quiz_monitor", { p_quiz: quiz })).rejects.toThrow(/tidak berhak/);
  });
  it("school admin sees all quizzes of their school", async () => {
    expect(await as(u.adminA, "select id from public.quizzes where id = $1", [quiz])).toHaveLength(1);
  });
  it("super admin can read across schools", async () => {
    const rows = await as(u.super, "select id from public.schools");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Answer key secrecy", () => {
  it("students cannot read questions, options or answers tables", async () => {
    expect(await as(u.studentA1, "select * from public.quiz_questions")).toHaveLength(0);
    expect(await as(u.studentA1, "select * from public.question_options")).toHaveLength(0);
    expect(await as(u.studentA1, "select * from public.student_answers")).toHaveLength(0);
  });
  it("students can see their assigned quiz but not unassigned ones", async () => {
    expect(await as(u.studentA1, "select id from public.quizzes where id = $1", [quiz])).toHaveLength(1);
    expect(await as(u.studentA2, "select id from public.quizzes where id = $1", [quiz])).toHaveLength(0);
  });
  it("get_attempt never exposes answer keys", async () => {
    const attemptId = await rpc<Id>(u.studentA1, "start_attempt", { p_quiz: quiz });
    const data = await rpc<Record<string, unknown>>(u.studentA1, "get_attempt", { p_attempt: attemptId });
    const json = JSON.stringify(data);
    expect(json).not.toContain("is_correct");
    expect(json).not.toContain("accepted_answers");
    expect(json).not.toContain("Pembahasan rahasia");
    expect(json).not.toContain("Makassar");
    expect((data.questions as unknown[]).length).toBe(5);
  });
  it("another student cannot read someone else's attempt", async () => {
    const [{ id }] = await admin<{ id: Id }>("select id from public.quiz_attempts where student_id = $1", [u.studentA1]);
    await expect(rpc(u.studentA2, "get_attempt", { p_attempt: id })).rejects.toThrow(/tidak ditemukan/);
    await expect(rpc(u.studentA2, "save_answer", { p_attempt: id, p_question: q.mc, p_selected: [opt.mcWrong] })).rejects.toThrow(/tidak ditemukan/);
  });
});

describe("Quiz session & grading", () => {
  let attemptId: Id;
  it("resumes the same attempt after a refresh", async () => {
    const [{ id }] = await admin<{ id: Id }>("select id from public.quiz_attempts where student_id = $1", [u.studentA1]);
    attemptId = await rpc<Id>(u.studentA1, "start_attempt", { p_quiz: quiz });
    expect(attemptId).toBe(id);
  });
  it("unassigned student cannot start the quiz", async () => {
    await expect(rpc(u.studentA2, "start_attempt", { p_quiz: quiz })).rejects.toThrow(/tidak ditugaskan/);
  });
  it("rejects options from another question and multiple picks on single choice", async () => {
    await expect(rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.mc, p_selected: [opt.ms2] })).rejects.toThrow(/tidak valid/);
    await expect(rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.mc, p_selected: [opt.mcRight, opt.mcWrong] })).rejects.toThrow(/satu jawaban/);
  });
  it("autosaves answers and tracks progress", async () => {
    await rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.mc, p_selected: [opt.mcWrong] });
    await rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.mc, p_selected: [opt.mcRight] }); // change answer
    await rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.ms, p_selected: [opt.ms2, opt.ms4] }); // 1 right, 1 wrong -> 0
    await rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.tf, p_selected: [opt.tfT] });
    const r = await rpc<{ answered_count: number }>(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.sa, p_text: "  makassar " });
    await rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.essay, p_text: "Fungsi memetakan setiap x ke tepat satu y" });
    expect(r.answered_count).toBe(4);
    const data = await rpc<{ answers: Record<string, unknown> }>(u.studentA1, "get_attempt", { p_attempt: attemptId });
    expect(Object.keys(data.answers)).toHaveLength(5);
  });
  it("grades on the server and is idempotent on double submit", async () => {
    await Promise.all([
      rpc(u.studentA1, "submit_attempt", { p_attempt: attemptId }),
      rpc(u.studentA1, "submit_attempt", { p_attempt: attemptId }),
    ]);
    const results = await admin<Record<string, string | number>>("select * from public.quiz_results where attempt_id = $1", [attemptId]);
    expect(results).toHaveLength(1);
    const r = results[0];
    // mc 10 + ms 0 + tf 10 + sa 10 = 30 of 50 (essay pending)
    expect(Number(r.points_earned)).toBe(30);
    expect(Number(r.points_possible)).toBe(50);
    expect(Number(r.score)).toBe(60);
    expect(r.pending_manual).toBe(1);
    expect(r.correct_count).toBe(3);
  });
  it("rejects saves after submission", async () => {
    await expect(rpc(u.studentA1, "save_answer", { p_attempt: attemptId, p_question: q.mc, p_selected: [opt.mcWrong] })).rejects.toThrow(/sudah dikumpulkan/);
  });
  it("hides keys in the review when explanations are disabled", async () => {
    const review = await rpc<Record<string, unknown>>(u.studentA1, "get_attempt_review", { p_attempt: attemptId });
    const json = JSON.stringify(review);
    expect(review.visible).toBe(true);
    expect(json).not.toContain("Pembahasan rahasia");
    expect(json).not.toContain('"is_correct":true}');
  });
  it("teacher completes manual grading; other teachers cannot", async () => {
    const [{ id }] = await admin<{ id: Id }>("select id from public.student_answers where attempt_id = $1 and question_id = $2", [attemptId, q.essay]);
    await expect(rpc(u.teacherA2, "grade_answer", { p_answer: id, p_points: 10 })).rejects.toThrow(/tidak berhak/);
    await expect(rpc(u.teacherA, "grade_answer", { p_answer: id, p_points: 11 })).rejects.toThrow(/antara 0 dan/);
    const res = await rpc<{ score: number; pending_manual: number; passed: boolean }>(u.teacherA, "grade_answer", { p_answer: id, p_points: 10 });
    expect(Number(res.score)).toBe(80);
    expect(res.pending_manual).toBe(0);
    expect(res.passed).toBe(true);
  });
  it("awards XP once per quiz (no farming via retakes)", async () => {
    const [{ xp: xp1 }] = await admin<{ xp: number }>("select xp from public.profiles where id = $1", [u.studentA1]);
    expect(xp1).toBeGreaterThan(0);
    const second = await rpc<Id>(u.studentA1, "start_attempt", { p_quiz: quiz });
    expect(second).not.toBe(attemptId);
    await rpc(u.studentA1, "save_answer", { p_attempt: second, p_question: q.mc, p_selected: [opt.mcRight] });
    await rpc(u.studentA1, "submit_attempt", { p_attempt: second });
    const ledger = await admin("select * from public.xp_ledger where student_id = $1 and source_type = 'quiz'", [u.studentA1]);
    expect(ledger).toHaveLength(1);
  });
  it("enforces the maximum number of attempts", async () => {
    await expect(rpc(u.studentA1, "start_attempt", { p_quiz: quiz })).rejects.toThrow(/Batas percobaan/);
  });
  it("partial credit for multiple select", async () => {
    const [{ id }] = await as<{ id: Id }>(
      u.teacherA,
      "insert into public.quizzes (school_id, teacher_id, title, access) values ($1, $2, 'Kuis Kode', 'code') returning id",
      [schoolA, u.teacherA],
    );
    const qms = await addQuestion(id, u.teacherA, "multiple_select", "Pilih semua genap", { points: 10 });
    const a = await addOption(u.teacherA, qms, "2", true);
    await addOption(u.teacherA, qms, "4", true);
    await addOption(u.teacherA, qms, "5", false);
    await rpc(u.teacherA, "publish_quiz", { p_quiz: id });
    const [{ access_code }] = await admin<{ access_code: string }>("select access_code from public.quizzes where id = $1", [id]);
    // student A2 is not assigned but can join by code
    const att = await rpc<Id>(u.studentA2, "start_attempt", { p_code: access_code.toLowerCase() });
    await rpc(u.studentA2, "save_answer", { p_attempt: att, p_question: qms, p_selected: [a] });
    await rpc(u.studentA2, "submit_attempt", { p_attempt: att });
    const [r] = await admin<{ score: string }>("select score from public.quiz_results where attempt_id = $1", [att]);
    expect(Number(r.score)).toBe(50);
  });
  it("auto-submits when the time is over and rejects late saves", async () => {
    const [{ id }] = await as<{ id: Id }>(
      u.teacherA,
      "insert into public.quizzes (school_id, teacher_id, title, access, duration_minutes) values ($1, $2, 'Kuis Singkat', 'code', 1) returning id",
      [schoolA, u.teacherA],
    );
    const qq = await addQuestion(id, u.teacherA, "true_false", "Langit biru");
    const t = await addOption(u.teacherA, qq, "Benar", true);
    await addOption(u.teacherA, qq, "Salah", false);
    await rpc(u.teacherA, "publish_quiz", { p_quiz: id });
    const [{ access_code }] = await admin<{ access_code: string }>("select access_code from public.quizzes where id = $1", [id]);
    const att = await rpc<Id>(u.studentA1, "start_attempt", { p_code: access_code });
    await rpc(u.studentA1, "save_answer", { p_attempt: att, p_question: qq, p_selected: [t] });
    await admin("update public.quiz_attempts set started_at = now() - interval '5 minutes', expires_at = now() - interval '2 minutes' where id = $1", [att]);
    const late = await rpc<{ expired: boolean }>(u.studentA1, "save_answer", { p_attempt: att, p_question: qq, p_selected: [t] });
    expect(late.expired).toBe(true);
    await expect(rpc(u.studentA1, "save_answer", { p_attempt: att, p_question: qq, p_selected: [t] })).rejects.toThrow(/sudah dikumpulkan/);
    const [a] = await admin<{ status: string; auto_submitted: boolean; is_late: boolean }>("select status, auto_submitted, is_late from public.quiz_attempts where id = $1", [att]);
    expect(a.status).toBe("submitted");
    expect(a.auto_submitted).toBe(true);
    const [r] = await admin<{ score: string }>("select score from public.quiz_results where attempt_id = $1", [att]);
    expect(Number(r.score)).toBe(100); // saved answers before expiry still count
  });
  it("monitoring reports student status", async () => {
    const rows = await rpc<unknown>(u.teacherA, "get_quiz_monitor", { p_quiz: quiz }).catch(() => null);
    expect(rows).not.toBeNull();
    const list = await as<{ full_name: string; status: string }>(u.teacherA, "select full_name, status from public.get_quiz_monitor($1)", [quiz]);
    expect(list.find((r) => r.full_name === "Andi Pratama")?.status).toBe("completed");
  });
});

describe("Results visibility", () => {
  it("students cannot read their score when the teacher hides results", async () => {
    const [{ id }] = await as<{ id: Id }>(
      u.teacherA,
      "insert into public.quizzes (school_id, teacher_id, title, access, show_result) values ($1, $2, 'Kuis Rahasia', 'code', false) returning id",
      [schoolA, u.teacherA],
    );
    const qq = await addQuestion(id, u.teacherA, "true_false", "1 > 0");
    const t = await addOption(u.teacherA, qq, "Benar", true);
    await addOption(u.teacherA, qq, "Salah", false);
    await rpc(u.teacherA, "publish_quiz", { p_quiz: id });
    const [{ access_code }] = await admin<{ access_code: string }>("select access_code from public.quizzes where id = $1", [id]);
    const att = await rpc<Id>(u.studentA2, "start_attempt", { p_code: access_code });
    await rpc(u.studentA2, "save_answer", { p_attempt: att, p_question: qq, p_selected: [t] });
    await rpc(u.studentA2, "submit_attempt", { p_attempt: att });
    expect(await as(u.studentA2, "select * from public.quiz_results where attempt_id = $1", [att])).toHaveLength(0);
    const review = await rpc<{ visible: boolean }>(u.studentA2, "get_attempt_review", { p_attempt: att });
    expect(review.visible).toBe(false);
  });
});

describe("Invitations & membership", () => {
  it("email-bound invitations only work for that verified email", async () => {
    const code = await invite(u.adminA, schoolA, "student", "belum@eduquiz.test");
    await expect(rpc(u.studentB, "accept_invitation", { p_code: code })).rejects.toThrow(/email lain/);
    await expect(rpc(u.unverified, "accept_invitation", { p_code: code })).rejects.toThrow(/Verifikasi email/);
  });
  it("single-use invitations cannot be reused", async () => {
    const code = await invite(u.adminA, schoolA, "teacher", null);
    const x = await createUser("x@eduquiz.test", "X");
    const y = await createUser("y@eduquiz.test", "Y");
    await rpc(x, "accept_invitation", { p_code: code });
    await expect(rpc(y, "accept_invitation", { p_code: code })).rejects.toThrow(/sudah digunakan/);
  });
  it("teachers cannot create invitations", async () => {
    await expect(invite(u.teacherA, schoolA, "school_admin", null)).rejects.toThrow(/tidak berhak/);
  });
  it("auto-accepts pending invitations for a verified email", async () => {
    const z = await createUser("z@eduquiz.test", "Z");
    await invite(u.adminB, schoolB, "student", "z@eduquiz.test", classB1);
    const n = await rpc<number>(z, "accept_pending_invitations");
    expect(n).toBe(1);
    expect(await as(z, "select id from public.classes where id = $1", [classB1])).toHaveLength(1);
  });
  it("CSV import validates rows and reports errors", async () => {
    const report = await rpc<{ imported: number; failed: number; rows: { ok: boolean; error?: string }[] }>(u.adminA, "import_students", {
      p_school: schoolA,
      p_rows: JSON.stringify([
        { email: "budi@eduquiz.test", full_name: "Budi", student_number: "1001", class_name: "X IPA 1" },
        { email: "bukan-email", full_name: "Salah" },
        { email: "budi@eduquiz.test", full_name: "Duplikat" },
        { email: "citra@eduquiz.test", full_name: "Citra", class_name: "Kelas Hantu" },
      ]),
    });
    expect(report.imported).toBe(1);
    expect(report.failed).toBe(3);
  });
  it("cannot remove the last school admin", async () => {
    await expect(admin("delete from public.school_members where user_id = $1", [u.adminB])).rejects.toThrow(/at least one active administrator/);
  });
});

describe("Gamification", () => {
  it("leaderboard hides other names when the school disables it", async () => {
    await as(u.adminA, "update public.schools set leaderboard_show_names = false where id = $1", [schoolA]);
    const rows = await as<{ display_name: string; is_me: boolean }>(u.studentA2, "select * from public.get_leaderboard($1, null)", [schoolA]);
    const other = rows.find((r) => !r.is_me);
    expect(other?.display_name).toMatch(/^Siswa #/);
  });
  it("achievements were granted", async () => {
    const rows = await as(u.studentA1, "select a.code from public.student_achievements sa join public.achievements a on a.id = sa.achievement_id");
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("Question builder RPC", () => {
  it("saves a question with options atomically and validates keys", async () => {
    const [{ id: qz }] = await as<{ id: Id }>(u.teacherA, "insert into public.quizzes (school_id, teacher_id, title) values ($1, $2, 'Builder') returning id", [schoolA, u.teacherA]);
    await expect(
      rpc(u.teacherA, "save_question", { p_quiz: qz, p_question: null, p_data: JSON.stringify({ type: "multiple_choice", prompt: "X?", points: 5, options: [{ label: "a", is_correct: true }, { label: "b", is_correct: true }] }) }),
    ).rejects.toThrow(/tepat satu/);
    const id = await rpc<Id>(u.teacherA, "save_question", { p_quiz: qz, p_question: null, p_data: JSON.stringify({ type: "multiple_choice", prompt: "X?", points: 5, options: [{ label: "a", is_correct: true }, { label: "b", is_correct: false }] }) });
    const opts = await as<{ id: Id; label: string }>(u.teacherA, "select id, label from public.question_options where question_id = $1 order by position", [id]);
    expect(opts).toHaveLength(2);
    // Update: keep first option id, replace second, add third
    await rpc(u.teacherA, "save_question", { p_quiz: qz, p_question: id, p_data: JSON.stringify({ type: "multiple_choice", prompt: "Y?", points: 5, options: [{ id: opts[0].id, label: "a2", is_correct: false }, { label: "c", is_correct: true }, { label: "d", is_correct: false }] }) });
    const after = await as<{ id: Id; label: string }>(u.teacherA, "select id, label from public.question_options where question_id = $1 order by position", [id]);
    expect(after.map((o) => o.label)).toEqual(["a2", "c", "d"]);
    expect(after[0].id).toBe(opts[0].id);
  });
  it("other teachers cannot save questions into someone else's quiz", async () => {
    await expect(rpc(u.teacherA2, "save_question", { p_quiz: quiz, p_question: null, p_data: JSON.stringify({ type: "true_false", prompt: "Z", points: 1, options: [{ label: "Benar", is_correct: true }, { label: "Salah", is_correct: false }] }) })).rejects.toThrow(/tidak berhak/);
  });
  it("scheduled job runs without errors", async () => {
    await admin("select public.run_scheduled_jobs()");
  });
});

describe("Storage policies (quiz-media)", () => {
  it("only the quiz owner can upload to its folder; only school members can read", async () => {
    const path = `${schoolA}/${quiz}/gambar.png`;
    await as(u.teacherA, "insert into storage.objects (bucket_id, name) values ('quiz-media', $1)", [path]);
    await expect(as(u.teacherA2, "insert into storage.objects (bucket_id, name) values ('quiz-media', $1)", [`${schoolA}/${quiz}/x.png`])).rejects.toThrow(/row-level security/);
    await expect(as(u.teacherB, "insert into storage.objects (bucket_id, name) values ('quiz-media', $1)", [`${schoolA}/${quiz}/y.png`])).rejects.toThrow(/row-level security/);
    // owner of a quiz cannot file it under another school's prefix
    await expect(as(u.teacherA, "insert into storage.objects (bucket_id, name) values ('quiz-media', $1)", [`${schoolB}/${quiz}/z.png`])).rejects.toThrow(/row-level security/);
    await expect(as(u.teacherA, "insert into storage.objects (bucket_id, name) values ('quiz-media', 'not-a-uuid/file.png')")).rejects.toThrow(/row-level security/);
    expect(await as(u.studentA1, "select name from storage.objects where name = $1", [path])).toHaveLength(1);
    expect(await as(u.studentB, "select name from storage.objects where name = $1", [path])).toHaveLength(0);
    expect(await as(u.teacherB, "update storage.objects set name = 'x' where name = $1 returning id", [path])).toHaveLength(0);
  });
});
