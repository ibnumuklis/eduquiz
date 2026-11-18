import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, createUser, rpc } from "./db";

type Id = string;
const u: Record<string, Id> = {};
let school: Id, otherSchool: Id, cls: Id, subject: Id;

async function invite(adminId: Id, s: Id, role: string, c: Id | null = null) {
  const row = await as<{ code: string }>(adminId,
    "select (public.create_invitation($1, $2::public.member_role, null, null, null, $3)).code as code", [s, role, c]);
  return row[0].code;
}
async function makeQuiz(owner: Id, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    school_id: school, teacher_id: owner, title: "Kuis Engagement", duration_minutes: 30, max_attempts: 3,
    passing_grade: 70, show_result: true, show_explanation: true, access: "assigned", subject_id: subject, ...extra,
  };
  const cols = Object.keys(row);
  const [{ id }] = await as<{ id: Id }>(owner,
    `insert into public.quizzes (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(row));
  await as(owner, "insert into public.quiz_assignments (quiz_id, class_id) values ($1, $2)", [id, cls]);
  return id;
}
const save = (owner: Id, quiz: Id, data: Record<string, unknown>) =>
  rpc<Id>(owner, "save_question", { p_quiz: quiz, p_question: null, p_data: JSON.stringify(data) });
const options = (q: Id) => admin<{ id: Id; is_correct: boolean }>("select id, is_correct from public.question_options where question_id = $1 order by position", [q]);

beforeAll(async () => {
  u.admin = await createUser("en.admin@eduquiz.test", "Admin EN");
  u.t1 = await createUser("en.guru1@eduquiz.test", "Guru Satu");
  u.t2 = await createUser("en.guru2@eduquiz.test", "Guru Dua");
  u.s1 = await createUser("en.siswa1@eduquiz.test", "Dewi");
  u.s2 = await createUser("en.siswa2@eduquiz.test", "Eko");
  u.oAdmin = await createUser("en.oadmin@eduquiz.test", "Admin Lain");
  u.oTeacher = await createUser("en.oguru@eduquiz.test", "Guru Lain");
  u.oStudent = await createUser("en.osiswa@eduquiz.test", "Siswa Lain");
  school = await rpc<Id>(u.admin, "create_school", { p_name: "SMA Engagement" });
  otherSchool = await rpc<Id>(u.oAdmin, "create_school", { p_name: "SMA Lain" });
  [{ id: cls }] = await as<{ id: Id }>(u.admin, "insert into public.classes (school_id, name) values ($1, 'XII IPA') returning id", [school]);
  [{ id: subject }] = await as<{ id: Id }>(u.admin, "insert into public.subjects (school_id, name) values ($1, 'Biologi') returning id", [school]);
  await rpc(u.t1, "accept_invitation", { p_code: await invite(u.admin, school, "teacher") });
  await rpc(u.t2, "accept_invitation", { p_code: await invite(u.admin, school, "teacher") });
  for (const s of [u.s1, u.s2]) await rpc(s, "accept_invitation", { p_code: await invite(u.admin, school, "student", cls) });
  await rpc(u.oTeacher, "accept_invitation", { p_code: await invite(u.oAdmin, otherSchool, "teacher") });
  await rpc(u.oStudent, "accept_invitation", { p_code: await invite(u.oAdmin, otherSchool, "student") });
  await as(u.admin, "insert into public.teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)", [school, u.t1, subject, cls]);
});

describe("integrity, language and audio", () => {
  it("accepts new integrity kinds and exposes language/alarm/audio to the student", async () => {
    const quiz = await makeQuiz(u.t1, { language: "en", integrity_alarm: true });
    await expect(save(u.t1, quiz, { type: "short_answer", prompt: "x", accepted_answers: ["x"], payload: { audio_path: `${otherSchool}/${quiz}/a.mp3` } }))
      .rejects.toThrow(/Audio tidak valid/);
    const q = await save(u.t1, quiz, { type: "short_answer", prompt: "Listen", accepted_answers: ["cat"], payload: { audio_path: `${school}/${quiz}/a.mp3`, audio_max_plays: 2, hint: "pet" } });
    const [row] = await admin<{ payload: Record<string, unknown> }>("select payload from public.quiz_questions where id = $1", [q]);
    expect(row.payload).toMatchObject({ audio_path: `${school}/${quiz}/a.mp3`, audio_max_plays: 2, hint: "pet" });
    await rpc(u.t1, "publish_quiz", { p_quiz: quiz });
    const a = await rpc<Id>(u.s1, "start_attempt", { p_quiz: quiz });
    const payload = await rpc<{ quiz: { language: string; integrity_alarm: boolean }; questions: { audio_path: string; audio_max_plays: number }[] }>(u.s1, "get_attempt", { p_attempt: a });
    expect(payload.quiz).toMatchObject({ language: "en", integrity_alarm: true });
    expect(payload.questions[0]).toMatchObject({ audio_path: `${school}/${quiz}/a.mp3`, audio_max_plays: 2 });
    expect(JSON.stringify(payload)).not.toContain("accepted_answers");
    for (const k of ["shortcut", "split_screen"]) await rpc(u.s1, "log_integrity_event", { p_attempt: a, p_kind: k });
    await rpc(u.s1, "submit_attempt", { p_attempt: a });
    const review = await rpc<{ quiz: { language: string }; items: { audio_path: string }[] }>(u.s1, "get_attempt_review", { p_attempt: a });
    expect(review.quiz.language).toBe("en");
    expect(review.items[0].audio_path).toBe(`${school}/${quiz}/a.mp3`);
    await expect(as(u.s1, "select * from public._get_attempt_core($1)", [a])).rejects.toThrow(/permission denied/);
  });
});

describe("school-shared bank", () => {
  it("shows only shared quizzes of other teachers and allows copying them", async () => {
    const shared = await makeQuiz(u.t1, { shared_with_school: true, title: "Sel dan Jaringan" });
    const priv = await makeQuiz(u.t1, { title: "Rahasia" });
    const q1 = await save(u.t1, shared, { type: "short_answer", prompt: "Organel penghasil energi?", accepted_answers: ["mitokondria"] });
    await save(u.t1, priv, { type: "short_answer", prompt: "Soal pribadi", accepted_answers: ["x"] });
    const bank = await rpc<{ id: Id; owner: string }[]>(u.t2, "get_school_bank", { p_school: school, p_search: null, p_type: null, p_limit: 50 });
    expect(bank.map((b) => b.id)).toEqual([q1]);
    expect(bank[0].owner).toBe("Guru Satu");
    await expect(rpc(u.oTeacher, "get_school_bank", { p_school: school, p_search: null, p_type: null, p_limit: 50 })).rejects.toThrow(/Hanya guru/);
    await expect(rpc(u.s1, "get_school_bank", { p_school: school, p_search: null, p_type: null, p_limit: 50 })).rejects.toThrow(/Hanya guru/);

    const [{ id: target }] = await as<{ id: Id }>(u.t2, "insert into public.quizzes (school_id, teacher_id, title) values ($1, $2, 'Salinan') returning id", [school, u.t2]);
    expect(await rpc<number>(u.t2, "copy_questions_to_quiz", { p_target_quiz: target, p_question_ids: [q1] })).toBe(1);
    const [privQ] = await admin<{ id: Id }>("select id from public.quiz_questions where quiz_id = $1", [priv]);
    expect(await rpc<number>(u.t2, "copy_questions_to_quiz", { p_target_quiz: target, p_question_ids: [privQ.id] })).toBe(0);
  });
});

describe("cross-quiz mastery", () => {
  it("aggregates TP mastery for a class across quizzes, for teachers of that class only", async () => {
    await as(u.t1, "insert into public.learning_objectives (school_id, code, description) values ($1, 'BIO-1', 'Menjelaskan struktur sel'), ($1, 'BIO-2', 'Menjelaskan fotosintesis')", [school]);
    const qa = await makeQuiz(u.t1, { title: "Kuis A" });
    const qb = await makeQuiz(u.t1, { title: "Kuis B" });
    const a1 = await save(u.t1, qa, { type: "short_answer", prompt: "a1", accepted_answers: ["ya"], objective_code: "BIO-1" });
    const b1 = await save(u.t1, qb, { type: "short_answer", prompt: "b1", accepted_answers: ["ya"], objective_code: "BIO-1" });
    const b2 = await save(u.t1, qb, { type: "short_answer", prompt: "b2", accepted_answers: ["ya"], objective_code: "BIO-2" });
    for (const q of [qa, qb]) await rpc(u.t1, "publish_quiz", { p_quiz: q });
    const answer = async (quiz: Id, answers: Record<Id, string>) => {
      const at = await rpc<Id>(u.s2, "start_attempt", { p_quiz: quiz });
      for (const [qid, text] of Object.entries(answers)) await rpc(u.s2, "save_answer", { p_attempt: at, p_question: qid, p_selected: [], p_text: text, p_data: null });
      await rpc(u.s2, "submit_attempt", { p_attempt: at });
    };
    await answer(qa, { [a1]: "ya" });
    await answer(qb, { [b1]: "tidak", [b2]: "ya" });

    const res = await rpc<{ quizzes: unknown[]; objectives: { id: Id; code: string }[]; students: { student_id: Id; quizzes_done: number; mastery: Record<string, number> }[] }>(
      u.t1, "get_class_mastery", { p_class: cls, p_subject: subject, p_from: null, p_to: null });
    const bio1 = res.objectives.find((o) => o.code === "BIO-1")!;
    const bio2 = res.objectives.find((o) => o.code === "BIO-2")!;
    const s2 = res.students.find((s) => s.student_id === u.s2)!;
    expect(s2.quizzes_done).toBeGreaterThanOrEqual(2);
    expect(s2.mastery[bio1.id]).toBe(50);
    expect(s2.mastery[bio2.id]).toBe(100);
    await expect(rpc(u.t2, "get_class_mastery", { p_class: cls, p_subject: null, p_from: null, p_to: null })).rejects.toThrow(/tidak mengajar/);
    await expect(rpc(u.s2, "get_class_mastery", { p_class: cls, p_subject: null, p_from: null, p_to: null })).rejects.toThrow(/tidak mengajar/);
  });
});

describe("live mode", () => {
  it("runs a teacher-paced session with speed scoring and no early key leaks", async () => {
    const quiz = await makeQuiz(u.t1, { title: "Live Biologi" });
    const mc = await save(u.t1, quiz, { type: "multiple_choice", prompt: "Pusat sel?", options: [{ label: "Inti sel", is_correct: true }, { label: "Dinding sel", is_correct: false }] });
    await save(u.t1, quiz, { type: "essay", prompt: "Uraian dilewati di Live" });
    const sid = await rpc<Id>(u.t1, "live_create", { p_quiz: quiz, p_seconds: 20 });
    const [{ code, question_ids }] = await admin<{ code: string; question_ids: Id[] }>("select code, question_ids from public.live_sessions where id = $1", [sid]);
    expect(question_ids).toEqual([mc]);

    await expect(rpc(u.oStudent, "live_join", { p_code: code })).rejects.toThrow(/hanya untuk siswa/);
    await expect(rpc(u.t2, "live_join", { p_code: code })).rejects.toThrow(/hanya untuk siswa/);
    expect(await rpc<Id>(u.s1, "live_join", { p_code: code })).toBe(sid);
    await rpc(u.s2, "live_join", { p_code: code });
    await expect(rpc(u.s1, "live_answer", { p_session: sid, p_selected: [], p_text: "x" })).rejects.toThrow(/belum dibuka/);
    await expect(rpc(u.s1, "live_control", { p_session: sid, p_action: "next" })).rejects.toThrow(/bukan pemandu/);

    await rpc(u.t1, "live_control", { p_session: sid, p_action: "next" });
    const playerView = await rpc<{ question: { options: { is_correct: boolean | null; count: number | null }[] } }>(u.s1, "live_state", { p_session: sid });
    expect(playerView.question.options.every((o) => o.is_correct === null && o.count === null)).toBe(true);

    const opts = await options(mc);
    await rpc(u.s1, "live_answer", { p_session: sid, p_selected: [opts[0].id], p_text: null });
    await rpc(u.s2, "live_answer", { p_session: sid, p_selected: [opts[1].id], p_text: null });
    await expect(rpc(u.s1, "live_answer", { p_session: sid, p_selected: [opts[0].id], p_text: null })).rejects.toThrow(/sudah menjawab/);

    const host = await rpc<{ question: { answered: number }; players: string[] }>(u.t1, "live_state", { p_session: sid });
    expect(host.question.answered).toBe(2);
    expect(host.players).toHaveLength(2);

    await rpc(u.t1, "live_control", { p_session: sid, p_action: "reveal" });
    const s1 = await rpc<{ me: { score: number; rank: number; last: { is_correct: boolean; points: number } }; leaderboard: { name: string; score: number }[] }>(u.s1, "live_state", { p_session: sid });
    expect(s1.me.last.is_correct).toBe(true);
    expect(s1.me.score).toBeGreaterThan(500);
    expect(s1.me.rank).toBe(1);
    expect(s1.leaderboard[0].name).toBe("Dewi");
    const s2 = await rpc<{ me: { score: number; last: { is_correct: boolean } } }>(u.s2, "live_state", { p_session: sid });
    expect(s2.me).toMatchObject({ score: 0, last: { is_correct: false } });
    await expect(rpc(u.oStudent, "live_state", { p_session: sid })).rejects.toThrow(/belum bergabung/);

    await rpc(u.t1, "live_control", { p_session: sid, p_action: "next" });
    const [{ status }] = await admin<{ status: string }>("select status from public.live_sessions where id = $1", [sid]);
    expect(status).toBe("ended");
    await expect(as(u.s1, "insert into public.live_players (session_id, school_id, student_id, score) values ($1, $2, $3, 9999)", [sid, school, u.s1]))
      .rejects.toThrow(/permission denied/);
  });
});
