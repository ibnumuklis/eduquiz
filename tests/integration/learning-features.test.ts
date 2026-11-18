import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, createUser, rpc } from "./db";

type Id = string;
const u: Record<string, Id> = {};
let school: Id, otherSchool: Id, cls: Id;

async function invite(adminId: Id, s: Id, role: string, c: Id | null = null) {
  const row = await as<{ code: string }>(adminId,
    "select (public.create_invitation($1, $2::public.member_role, null, null, null, $3)).code as code", [s, role, c]);
  return row[0].code;
}

async function makeQuiz(owner: Id, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    school_id: school, teacher_id: owner, title: "Kuis AKM", duration_minutes: 30, max_attempts: 3,
    passing_grade: 70, show_result: true, show_explanation: true, access: "assigned", ...extra,
  };
  const cols = Object.keys(row);
  const vals = Object.values(row);
  const [{ id }] = await as<{ id: Id }>(owner,
    `insert into public.quizzes (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, vals);
  await as(owner, "insert into public.quiz_assignments (quiz_id, class_id) values ($1, $2)", [id, cls]);
  return id;
}

const save = (owner: Id, quiz: Id, data: Record<string, unknown>, question: Id | null = null) =>
  rpc<Id>(owner, "save_question", { p_quiz: quiz, p_question: question, p_data: JSON.stringify(data) });

async function options(questionId: Id) {
  return admin<{ id: Id; label: string; is_correct: boolean; match_text: string | null }>(
    "select id, label, is_correct, match_text from public.question_options where question_id = $1 order by position", [questionId]);
}
const saveAnswer = (uid: Id, attempt: Id, question: Id, a: { sel?: Id[]; text?: string | null; data?: unknown }) =>
  rpc<{ expired: boolean }>(uid, "save_answer", {
    p_attempt: attempt, p_question: question, p_selected: a.sel ?? [], p_text: a.text ?? null,
    p_data: a.data === undefined ? null : JSON.stringify(a.data),
  });

beforeAll(async () => {
  u.admin = await createUser("lf.admin@eduquiz.test", "Admin LF");
  u.teacher = await createUser("lf.guru@eduquiz.test", "Guru LF");
  u.teacher2 = await createUser("lf.guru2@eduquiz.test", "Guru Dua");
  u.s1 = await createUser("lf.siswa1@eduquiz.test", "Ani");
  u.s2 = await createUser("lf.siswa2@eduquiz.test", "Budi");
  u.s3 = await createUser("lf.siswa3@eduquiz.test", "Citra");
  u.otherAdmin = await createUser("lf.other@eduquiz.test", "Admin Lain");
  u.otherTeacher = await createUser("lf.otherguru@eduquiz.test", "Guru Lain");

  school = await rpc<Id>(u.admin, "create_school", { p_name: "SMK Fitur Belajar" });
  otherSchool = await rpc<Id>(u.otherAdmin, "create_school", { p_name: "SMP Sekolah Lain" });
  [{ id: cls }] = await as<{ id: Id }>(u.admin, "insert into public.classes (school_id, name) values ($1, 'XI TKJ') returning id", [school]);
  await rpc(u.teacher, "accept_invitation", { p_code: await invite(u.admin, school, "teacher") });
  await rpc(u.teacher2, "accept_invitation", { p_code: await invite(u.admin, school, "teacher") });
  for (const s of [u.s1, u.s2, u.s3]) await rpc(s, "accept_invitation", { p_code: await invite(u.admin, school, "student", cls) });
  await rpc(u.otherTeacher, "accept_invitation", { p_code: await invite(u.otherAdmin, otherSchool, "teacher") });
  const [{ id: subject }] = await as<{ id: Id }>(u.admin, "insert into public.subjects (school_id, name) values ($1, 'IPA') returning id", [school]);
  for (const t of [u.teacher, u.teacher2]) {
    await as(u.admin, "insert into public.teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)", [school, t, subject, cls]);
  }
});

describe("AKM question types: validation", () => {
  it("rejects invalid structures for new types", async () => {
    const quiz = await makeQuiz(u.teacher);
    await expect(save(u.teacher, quiz, { type: "tf_grid", prompt: "Satu pernyataan", options: [{ label: "A", is_correct: true }] }))
      .rejects.toThrow(/2–10 pernyataan/);
    await expect(save(u.teacher, quiz, { type: "matching", prompt: "Jodohkan", options: [{ label: "A", match_text: "1" }, { label: "B" }] }))
      .rejects.toThrow(/jodohnya/);
    await expect(save(u.teacher, quiz, { type: "unknown_type", prompt: "x" })).rejects.toThrow(/Tipe soal tidak valid/);
  });

  it("forces essay to manual grading and stores a sanitized rubric", async () => {
    const quiz = await makeQuiz(u.teacher);
    const id = await save(u.teacher, quiz, {
      type: "essay", prompt: "Jelaskan fotosintesis", points: 10,
      payload: { rubric: [{ criterion: "Menyebut klorofil", points: 4 }, { criterion: "", points: 9 }, { criterion: "Menjelaskan hasil", points: 6 }] },
    });
    const [row] = await admin<{ manual_grading: boolean; payload: { rubric: { criterion: string }[] } }>(
      "select manual_grading, payload from public.quiz_questions where id = $1", [id]);
    expect(row.manual_grading).toBe(true);
    expect(row.payload.rubric).toHaveLength(2);
  });

  it("forces is_correct=false for poll/matching/ordering options", async () => {
    const quiz = await makeQuiz(u.teacher);
    const id = await save(u.teacher, quiz, { type: "poll", prompt: "Pilih favorit", options: [{ label: "A", is_correct: true }, { label: "B", is_correct: true }] });
    expect((await options(id)).every((o) => !o.is_correct)).toBe(true);
  });
});

describe("AKM question types: answering and grading", () => {
  let quiz: Id, attempt: Id;
  const q: Record<string, Id> = {};

  beforeAll(async () => {
    quiz = await makeQuiz(u.teacher);
    q.grid = await save(u.teacher, quiz, { type: "tf_grid", prompt: "Tentukan B/S", points: 10, options: [
      { label: "Air mendidih 100°C", is_correct: true }, { label: "Matahari planet", is_correct: false },
      { label: "Bumi bulat", is_correct: true }, { label: "Es lebih berat dari air", is_correct: false }] });
    q.match = await save(u.teacher, quiz, { type: "matching", prompt: "Jodohkan ibu kota", points: 10, options: [
      { label: "Sulawesi Selatan", match_text: "Makassar" }, { label: "Jawa Barat", match_text: "Bandung" }] });
    q.order = await save(u.teacher, quiz, { type: "ordering", prompt: "Urutkan", points: 10, options: [
      { label: "Satu" }, { label: "Dua" }, { label: "Tiga" }] });
    q.essay = await save(u.teacher, quiz, { type: "essay", prompt: "Uraikan", points: 10 });
    q.poll = await save(u.teacher, quiz, { type: "poll", prompt: "Suka pelajaran ini?", options: [{ label: "Ya" }, { label: "Tidak" }] });
    q.cloud = await save(u.teacher, quiz, { type: "word_cloud", prompt: "Satu kata tentang hari ini" });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });
    attempt = await rpc<Id>(u.s1, "start_attempt", { p_quiz: quiz });
  });

  it("serves a key-free payload with shuffled matching choices", async () => {
    const payload = await rpc<{ questions: { id: Id; type: string; options: Record<string, unknown>[]; right_choices: string[] | null }[] }>(
      u.s1, "get_attempt", { p_attempt: attempt });
    const json = JSON.stringify(payload);
    expect(json).not.toContain("is_correct\":true");
    expect(json).not.toContain("match_text");
    const m = payload.questions.find((x) => x.id === q.match)!;
    expect(m.right_choices?.sort()).toEqual(["Bandung", "Makassar"]);
    expect(m.options.every((o) => !("match_text" in o))).toBe(true);
  });

  it("validates structured answers", async () => {
    const grid = await options(q.grid);
    await expect(saveAnswer(u.s1, attempt, q.grid, { data: { [grid[0].id]: "ya" } })).rejects.toThrow(/Benar atau Salah/);
    const match = await options(q.match);
    await expect(saveAnswer(u.s1, attempt, q.match, { data: { [match[0].id]: "Jakarta" } })).rejects.toThrow(/Pasangan jawaban tidak valid/);
    const ord = await options(q.order);
    await expect(saveAnswer(u.s1, attempt, q.order, { sel: [ord[0].id, ord[0].id, ord[1].id] })).rejects.toThrow(/Urutan jawaban tidak valid/);
  });

  it("grades tf_grid, matching and ordering with partial credit; essays wait; surveys are unscored", async () => {
    const grid = await options(q.grid);
    // 3 of 4 statements correct
    await saveAnswer(u.s1, attempt, q.grid, { data: { [grid[0].id]: true, [grid[1].id]: false, [grid[2].id]: true, [grid[3].id]: true } });
    const match = await options(q.match);
    await saveAnswer(u.s1, attempt, q.match, { data: { [match[0].id]: "Makassar", [match[1].id]: "Makassar" } }); // 1 of 2
    const ord = await options(q.order);
    await saveAnswer(u.s1, attempt, q.order, { sel: [ord[0].id, ord[1].id, ord[2].id] }); // exact
    await saveAnswer(u.s1, attempt, q.essay, { text: "Tumbuhan membuat makanan dengan klorofil." });
    await saveAnswer(u.s1, attempt, q.poll, { sel: [(await options(q.poll))[0].id] });
    await saveAnswer(u.s1, attempt, q.cloud, { text: "Seru" });
    await rpc(u.s1, "submit_attempt", { p_attempt: attempt });

    const answers = await admin<{ question_id: Id; points_awarded: string | null; is_correct: boolean | null; needs_manual_grading: boolean }>(
      "select question_id, points_awarded, is_correct, needs_manual_grading from public.student_answers where attempt_id = $1", [attempt]);
    const by = Object.fromEntries(answers.map((a) => [a.question_id, a]));
    expect(Number(by[q.grid].points_awarded)).toBe(7.5);
    expect(Number(by[q.match].points_awarded)).toBe(5);
    expect(Number(by[q.order].points_awarded)).toBe(10);
    expect(by[q.order].is_correct).toBe(true);
    expect(by[q.essay].needs_manual_grading).toBe(true);
    expect(Number(by[q.poll].points_awarded)).toBe(0);

    const [r] = await admin<{ points_possible: string; points_earned: string; pending_manual: number; score: string; game_score: number }>(
      "select points_possible, points_earned, pending_manual, score, game_score from public.quiz_results where attempt_id = $1", [attempt]);
    expect(Number(r.points_possible)).toBe(40);          // poll & word cloud excluded
    expect(Number(r.points_earned)).toBe(22.5);
    expect(r.pending_manual).toBe(1);
    expect(r.game_score).toBeGreaterThan(0);
  });

  it("lets the teacher grade the essay with feedback and rubric scores", async () => {
    const [{ id }] = await admin<{ id: Id }>("select id from public.student_answers where attempt_id = $1 and question_id = $2", [attempt, q.essay]);
    await rpc(u.teacher, "grade_answer", { p_answer: id, p_points: 8, p_feedback: "Bagus, lengkapi hasil fotosintesis.", p_rubric: JSON.stringify([{ criterion: "A", points: 8 }]) });
    const review = await rpc<{ result: { score: number; pending_manual: number }; items: { id: Id; answer: { teacher_feedback: string } }[] }>(
      u.s1, "get_attempt_review", { p_attempt: attempt });
    expect(review.result.pending_manual).toBe(0);
    expect(Number(review.result.score)).toBe(76.25);
    expect(review.items.find((i) => i.id === q.essay)?.answer.teacher_feedback).toMatch(/Bagus/);
  });

  it("returns item analysis with distractors and word counts to the teacher only", async () => {
    const analysis = await rpc<{ questions: { id: Id; p_value: number | null; words: { text: string }[] | null; options: { count: number }[] }[]; students: { cells: Record<string, number | null> }[] }>(
      u.teacher, "get_quiz_analysis", { p_quiz: quiz });
    expect(analysis.students).toHaveLength(1);
    expect(analysis.students[0].cells[q.grid]).toBe(0.75);
    expect(analysis.students[0].cells[q.poll]).toBeUndefined();
    expect(analysis.questions.find((x) => x.id === q.cloud)?.words?.[0].text).toBe("seru");
    expect(analysis.questions.find((x) => x.id === q.poll)?.options[0].count).toBe(1);
    await expect(rpc(u.s1, "get_quiz_analysis", { p_quiz: quiz })).rejects.toThrow(/tidak berhak/);
    await expect(rpc(u.teacher2, "get_quiz_analysis", { p_quiz: quiz })).rejects.toThrow(/tidak berhak/);
  });
});

describe("Practice mode (remedial & mastery)", () => {
  it("serves only unmastered questions and accumulates mastery", async () => {
    const quiz = await makeQuiz(u.teacher, { mode: "practice", mastery_target: 100, show_explanation: false });
    const [{ show_explanation }] = await admin<{ show_explanation: boolean }>("select show_explanation from public.quizzes where id = $1", [quiz]);
    expect(show_explanation).toBe(true); // practice forces feedback on
    const q1 = await save(u.teacher, quiz, { type: "multiple_choice", prompt: "1+1", options: [{ label: "2", is_correct: true }, { label: "3", is_correct: false }] });
    const q2 = await save(u.teacher, quiz, { type: "short_answer", prompt: "Ibu kota RI", accepted_answers: ["Jakarta"] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });

    const a1 = await rpc<Id>(u.s2, "start_attempt", { p_quiz: quiz });
    const o1 = await options(q1);
    await saveAnswer(u.s2, a1, q1, { sel: [o1[0].id] });
    await saveAnswer(u.s2, a1, q2, { text: "Bandung" });
    await rpc(u.s2, "submit_attempt", { p_attempt: a1 });
    const rev1 = await rpc<{ result: { score: number; mastered: boolean }; can_practice_again: boolean }>(u.s2, "get_attempt_review", { p_attempt: a1 });
    expect(Number(rev1.result.score)).toBe(50);
    expect(rev1.result.mastered).toBe(false);
    expect(rev1.can_practice_again).toBe(true);

    const a2 = await rpc<Id>(u.s2, "start_attempt", { p_quiz: quiz });
    const [att] = await admin<{ question_order: Id[]; is_remedial: boolean }>("select question_order, is_remedial from public.quiz_attempts where id = $1", [a2]);
    expect(att.is_remedial).toBe(true);
    expect(att.question_order).toEqual([q2]);
    await saveAnswer(u.s2, a2, q2, { text: "jakarta" });
    await rpc(u.s2, "submit_attempt", { p_attempt: a2 });
    const rev2 = await rpc<{ result: { score: number; mastered: boolean }; can_practice_again: boolean }>(u.s2, "get_attempt_review", { p_attempt: a2 });
    expect(Number(rev2.result.score)).toBe(100);
    expect(rev2.result.mastered).toBe(true);
    expect(rev2.can_practice_again).toBe(false);
    const ach = await admin("select 1 from public.student_achievements sa join public.achievements a on a.id = sa.achievement_id where a.code = 'practice_master' and sa.student_id = $1", [u.s2]);
    expect(ach).toHaveLength(1);
  });
});

describe("Exam mode", () => {
  it("disables power-ups/feedback and awards no XP or game score", async () => {
    const quiz = await makeQuiz(u.teacher, { mode: "exam", powerups_enabled: true, instant_feedback: true });
    const [cfg] = await admin<{ powerups_enabled: boolean; instant_feedback: boolean }>("select powerups_enabled, instant_feedback from public.quizzes where id = $1", [quiz]);
    expect(cfg).toEqual({ powerups_enabled: false, instant_feedback: false });
    const q1 = await save(u.teacher, quiz, { type: "multiple_choice", prompt: "Ujian", options: [{ label: "Benar", is_correct: true }, { label: "Salah", is_correct: false }, { label: "X", is_correct: false }] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });
    const [{ xp: before }] = await admin<{ xp: number }>("select xp from public.profiles where id = $1", [u.s3]);
    const a = await rpc<Id>(u.s3, "start_attempt", { p_quiz: quiz });
    await expect(rpc(u.s3, "use_powerup", { p_attempt: a, p_question: q1, p_kind: "fifty_fifty" })).rejects.toThrow(/Power-up tidak aktif/);
    await saveAnswer(u.s3, a, q1, { sel: [(await options(q1))[0].id] });
    await rpc(u.s3, "submit_attempt", { p_attempt: a });
    const [r] = await admin<{ score: string; game_score: number; xp_awarded: number }>("select score, game_score, xp_awarded from public.quiz_results where attempt_id = $1", [a]);
    expect(Number(r.score)).toBe(100);
    expect(r.game_score).toBe(0);
    expect(r.xp_awarded).toBe(0);
    const [{ xp: after }] = await admin<{ xp: number }>("select xp from public.profiles where id = $1", [u.s3]);
    expect(after).toBe(before);
  });
});

describe("Instant feedback & power-ups", () => {
  let quiz: Id, attempt: Id, mc: Id, sa: Id;
  beforeAll(async () => {
    quiz = await makeQuiz(u.teacher, { powerups_enabled: true, instant_feedback: true });
    mc = await save(u.teacher, quiz, { type: "multiple_choice", prompt: "Ibu kota Sulsel?", payload: { hint: "Kota Daeng" }, explanation: "Makassar.",
      options: [{ label: "Makassar", is_correct: true }, { label: "Manado", is_correct: false }, { label: "Palu", is_correct: false }, { label: "Kendari", is_correct: false }] });
    sa = await save(u.teacher, quiz, { type: "short_answer", prompt: "2x3", accepted_answers: ["6"] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });
    attempt = await rpc<Id>(u.s1, "start_attempt", { p_quiz: quiz });
  });

  it("hint and 50:50 work once each and never hide the correct option", async () => {
    const hint = await rpc<{ hint: string }>(u.s1, "use_powerup", { p_attempt: attempt, p_question: mc, p_kind: "hint" });
    expect(hint.hint).toBe("Kota Daeng");
    await expect(rpc(u.s1, "use_powerup", { p_attempt: attempt, p_question: mc, p_kind: "hint" })).rejects.toThrow(/sudah dipakai/);
    const ff = await rpc<{ hidden: Id[] }>(u.s1, "use_powerup", { p_attempt: attempt, p_question: mc, p_kind: "fifty_fifty" });
    const opts = await options(mc);
    expect(ff.hidden).toHaveLength(2);
    expect(ff.hidden).not.toContain(opts[0].id);
    const payload = await rpc<{ questions: { id: Id; options: unknown[]; hint: string | null }[] }>(u.s1, "get_attempt", { p_attempt: attempt });
    const pq = payload.questions.find((x) => x.id === mc)!;
    expect(pq.options).toHaveLength(2);
    expect(pq.hint).toBe("Kota Daeng");
    await expect(saveAnswer(u.s1, attempt, mc, { sel: [ff.hidden[0]] })).rejects.toThrow(/tidak valid/);
  });

  it("locks checked answers, withholds the key while a retry is possible, then reveals it", async () => {
    await saveAnswer(u.s1, attempt, sa, { text: "5" });
    const first = await rpc<{ is_correct: boolean; can_retry: boolean; key: unknown }>(u.s1, "check_answer", { p_attempt: attempt, p_question: sa });
    expect(first.is_correct).toBe(false);
    expect(first.can_retry).toBe(true);
    expect(first.key).toBeNull();
    await expect(saveAnswer(u.s1, attempt, sa, { text: "6" })).rejects.toThrow(/dikunci/);
    await rpc(u.s1, "use_powerup", { p_attempt: attempt, p_question: sa, p_kind: "second_chance" });
    await saveAnswer(u.s1, attempt, sa, { text: "6" });
    const second = await rpc<{ is_correct: boolean; key: { accepted_answers: string[] } }>(u.s1, "check_answer", { p_attempt: attempt, p_question: sa });
    expect(second.is_correct).toBe(true);
    expect(second.key.accepted_answers).toEqual(["6"]);
  });

  it("rejects check_answer when instant feedback is off", async () => {
    const plain = await makeQuiz(u.teacher);
    const q1 = await save(u.teacher, plain, { type: "short_answer", prompt: "x", accepted_answers: ["x"] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: plain });
    const a = await rpc<Id>(u.s2, "start_attempt", { p_quiz: plain });
    await saveAnswer(u.s2, a, q1, { text: "x" });
    await expect(rpc(u.s2, "check_answer", { p_attempt: a, p_question: q1 })).rejects.toThrow(/tidak aktif/);
  });
});

describe("Integrity events", () => {
  it("counts events, notifies the teacher at 3 and protects access", async () => {
    const quiz = await makeQuiz(u.teacher, { require_fullscreen: true });
    await save(u.teacher, quiz, { type: "short_answer", prompt: "x", accepted_answers: ["x"] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });
    const a = await rpc<Id>(u.s3, "start_attempt", { p_quiz: quiz });
    await expect(rpc(u.s3, "log_integrity_event", { p_attempt: a, p_kind: "hack" })).rejects.toThrow(/tidak dikenal/);
    await expect(rpc(u.s1, "log_integrity_event", { p_attempt: a, p_kind: "tab_hidden" })).rejects.toThrow(/tidak ditemukan/);
    for (const kind of ["tab_hidden", "fullscreen_exit", "paste"]) await rpc(u.s3, "log_integrity_event", { p_attempt: a, p_kind: kind });
    const monitor = await as<{ student_id: Id; integrity_count: number }>(u.teacher, "select * from public.get_quiz_monitor($1)", [quiz]);
    expect(monitor.find((m) => m.student_id === u.s3)?.integrity_count).toBe(3);
    const notes = await admin("select 1 from public.notifications where user_id = $1 and type = 'integrity.warning' and dedupe_key = $2", [u.teacher, `integrity:${a}`]);
    expect(notes).toHaveLength(1);
    expect(await as(u.teacher, "select id from public.integrity_events where attempt_id = $1", [a])).toHaveLength(3);
    expect(await as(u.teacher2, "select id from public.integrity_events where attempt_id = $1", [a])).toHaveLength(0);
    await expect(as(u.s3, "insert into public.integrity_events (attempt_id, quiz_id, school_id, student_id, kind) values ($1, $2, $3, $4, 'copy')", [a, quiz, school, u.s3]))
      .rejects.toThrow(/permission denied/);
  });
});

describe("Accommodations", () => {
  it("extends time and reduces options for the student; only staff can set them", async () => {
    await expect(as(u.s2, "insert into public.student_accommodations (school_id, student_id, time_multiplier) values ($1, $2, 2)", [school, u.s2]))
      .rejects.toThrow(/row-level security/);
    await expect(as(u.otherTeacher, "insert into public.student_accommodations (school_id, student_id, time_multiplier) values ($1, $2, 2)", [school, u.s2]))
      .rejects.toThrow(/row-level security/);
    await expect(as(u.teacher, "insert into public.student_accommodations (school_id, student_id) values ($1, $2)", [school, u.teacher]))
      .rejects.toThrow(/tidak terdaftar/);
    await as(u.teacher, "insert into public.student_accommodations (school_id, student_id, time_multiplier, reduce_options, read_aloud) values ($1, $2, 1.5, true, true)", [school, u.s2]);

    const quiz = await makeQuiz(u.teacher);
    const mc = await save(u.teacher, quiz, { type: "multiple_choice", prompt: "Pilih", options: [
      { label: "A", is_correct: false }, { label: "B", is_correct: true }, { label: "C", is_correct: false }, { label: "D", is_correct: false }] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });
    const a = await rpc<Id>(u.s2, "start_attempt", { p_quiz: quiz });
    const [att] = await admin<{ minutes: string; opts: Id[] }>(
      "select extract(epoch from expires_at - started_at) / 60 as minutes, array(select jsonb_array_elements_text(option_order -> $2)) as opts from public.quiz_attempts where id = $1", [a, mc]);
    expect(Math.round(Number(att.minutes))).toBe(45);
    expect(att.opts).toHaveLength(2);
    expect(att.opts).toContain((await options(mc))[1].id);
    const payload = await rpc<{ student: { read_aloud: boolean } }>(u.s2, "get_attempt", { p_attempt: a });
    expect(payload.student.read_aloud).toBe(true);
  });
});

describe("Objectives, stimuli, folders and import", () => {
  it("resolves TP codes per school and rejects foreign objectives", async () => {
    await as(u.teacher, "insert into public.learning_objectives (school_id, code, description, phase) values ($1, 'tp-1.1', 'Menganalisis teks eksposisi', 'E')", [school]);
    const [{ id: foreign }] = await as<{ id: Id }>(u.otherTeacher, "insert into public.learning_objectives (school_id, code, description) values ($1, 'TP-9', 'Lain') returning id", [otherSchool]);
    const quiz = await makeQuiz(u.teacher);
    const id = await save(u.teacher, quiz, { type: "short_answer", prompt: "x", accepted_answers: ["x"], objective_code: "TP-1.1" });
    const [row] = await admin<{ objective_id: Id | null }>("select objective_id from public.quiz_questions where id = $1", [id]);
    expect(row.objective_id).not.toBeNull();
    await expect(save(u.teacher, quiz, { type: "short_answer", prompt: "x", accepted_answers: ["x"], objective_id: foreign })).rejects.toThrow(/tidak valid/);
    await expect(save(u.teacher, quiz, { type: "short_answer", prompt: "x", accepted_answers: ["x"], objective_code: "TP-404" })).rejects.toThrow(/belum terdaftar/);
    expect(await as(u.s1, "select id from public.learning_objectives")).toHaveLength(0);
  });

  it("keeps stimulus questions together and copies stimuli with duplicated quizzes", async () => {
    const quiz = await makeQuiz(u.teacher, { shuffle_questions: true });
    const [{ id: stim }] = await as<{ id: Id }>(u.teacher, "insert into public.quiz_stimuli (quiz_id, title, content) values ($1, 'Bacaan 1', 'Teks panjang tentang laut.') returning id", [quiz]);
    const a1 = await save(u.teacher, quiz, { type: "short_answer", prompt: "Q stim 1", accepted_answers: ["a"], stimulus_id: stim });
    await save(u.teacher, quiz, { type: "short_answer", prompt: "Q lepas", accepted_answers: ["a"] });
    const a2 = await save(u.teacher, quiz, { type: "short_answer", prompt: "Q stim 2", accepted_answers: ["a"], stimulus_id: stim });
    await save(u.teacher, quiz, { type: "short_answer", prompt: "Q lepas 2", accepted_answers: ["a"] });
    await rpc(u.teacher, "publish_quiz", { p_quiz: quiz });
    const att = await rpc<Id>(u.s1, "start_attempt", { p_quiz: quiz });
    const [{ question_order }] = await admin<{ question_order: Id[] }>("select question_order from public.quiz_attempts where id = $1", [att]);
    expect(Math.abs(question_order.indexOf(a1) - question_order.indexOf(a2))).toBe(1);
    const payload = await rpc<{ questions: { id: Id; stimulus: { content: string } | null }[] }>(u.s1, "get_attempt", { p_attempt: att });
    expect(payload.questions.find((x) => x.id === a1)?.stimulus?.content).toMatch(/laut/);

    const copy = await rpc<Id>(u.teacher, "duplicate_quiz", { p_quiz: quiz });
    const stimuli = await admin<{ n: string }>("select count(*) as n from public.quiz_stimuli where quiz_id = $1", [copy]);
    expect(Number(stimuli[0].n)).toBe(1);
    const linked = await admin<{ n: string }>("select count(*) as n from public.quiz_questions where quiz_id = $1 and stimulus_id is not null", [copy]);
    expect(Number(linked[0].n)).toBe(2);
  });

  it("only lets teachers file quizzes into their own folders", async () => {
    const [{ id: mine }] = await as<{ id: Id }>(u.teacher, "insert into public.quiz_folders (school_id, name) values ($1, 'Kelas XI') returning id", [school]);
    const [{ id: theirs }] = await as<{ id: Id }>(u.teacher2, "insert into public.quiz_folders (school_id, name) values ($1, 'Punya Guru 2') returning id", [school]);
    const quiz = await makeQuiz(u.teacher);
    await as(u.teacher, "update public.quizzes set folder_id = $2 where id = $1", [quiz, mine]);
    await expect(as(u.teacher, "update public.quizzes set folder_id = $2 where id = $1", [quiz, theirs])).rejects.toThrow(/Folder tidak valid/);
    expect(await as(u.teacher, "select id from public.quiz_folders where id = $1", [theirs])).toHaveLength(0);
  });

  it("imports valid rows and reports failing rows by number", async () => {
    const quiz = await makeQuiz(u.teacher);
    const res = await rpc<{ imported: number; errors: { row: number; message: string }[] }>(u.teacher, "import_questions", {
      p_quiz: quiz,
      p_rows: JSON.stringify([
        { row: 2, type: "multiple_choice", prompt: "1+1", options: [{ label: "2", is_correct: true }, { label: "3", is_correct: false }] },
        { row: 3, type: "multiple_choice", prompt: "Tanpa kunci", options: [{ label: "a", is_correct: false }, { label: "b", is_correct: false }] },
        { row: 4, type: "tf_grid", prompt: "Grid", options: [{ label: "x", is_correct: true }, { label: "y", is_correct: false }] },
      ]),
    });
    expect(res.imported).toBe(2);
    expect(res.errors).toEqual([{ row: 3, message: "Pilih tepat satu jawaban benar" }]);
    await expect(rpc(u.teacher2, "import_questions", { p_quiz: quiz, p_rows: JSON.stringify([{ type: "essay", prompt: "x" }]) })).rejects.toThrow(/tidak berhak/);
  });
});
