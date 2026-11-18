import type { ReviewPayload, ReviewItem } from "@/types";
import { QUESTION_TYPE_LABEL, SURVEY_TYPES } from "@/lib/validations/quiz";
import { keySummary } from "@/lib/utils/quiz";
import { formatDuration, formatScore } from "@/lib/utils";
import { safeFilename, type PdfSpec } from "./report";

function answerText(it: ReviewItem) {
  const a = it.answer;
  const label = (id: string) => it.options.find((o) => o.id === id)?.label ?? "?";
  const data = (a.answer_data ?? {}) as Record<string, boolean | string>;
  if (it.type === "tf_grid") return it.options.map((o, i) => `${i + 1}.${data[o.id] === true ? "B" : data[o.id] === false ? "S" : "-"}`).join(" ");
  if (it.type === "matching") return it.options.map((o) => `${o.label} → ${data[o.id] ?? "-"}`).join("; ");
  if (it.type === "ordering") return a.selected_option_ids.map(label).join(" → ") || "—";
  if (a.selected_option_ids.length) return a.selected_option_ids.map(label).join(", ");
  return a.text_answer || "—";
}

/** PDF of one submitted attempt (student result / teacher review). */
export function buildResultPdf(review: ReviewPayload, opts: { school?: string; student?: string }): PdfSpec {
  const r = review.result!;
  const items = review.items ?? [];
  const status = (it: ReviewItem) => SURVEY_TYPES.has(it.type) ? "Survei" : it.answer.needs_manual_grading ? "Menunggu koreksi"
    : it.answer.is_correct ? "Benar" : (it.answer.points_awarded ?? 0) > 0 ? "Sebagian" : "Salah/kosong";
  return {
    filename: `hasil-${safeFilename(review.quiz.title)}${opts.student ? `-${safeFilename(opts.student)}` : ""}`,
    title: `Hasil Kuis — ${review.quiz.title}`,
    subtitle: opts.student,
    school: opts.school,
    meta: [
      [review.quiz.mode === "practice" ? "Penguasaan" : "Nilai", formatScore(r.score)],
      ["Status", r.pending_manual > 0 ? "Menunggu koreksi" : review.quiz.mode === "practice" ? (r.mastered ? "Tuntas" : "Belum tuntas") : r.passed ? "Lulus" : "Belum lulus"],
      ["Benar / salah / kosong", `${r.correct_count} / ${r.wrong_count} / ${r.unanswered_count}`],
      ["Durasi", formatDuration(r.duration_seconds)],
      ["Percobaan ke-", String(review.attempt.attempt_number ?? 1)],
    ],
    sections: [{
      heading: "Rincian jawaban",
      head: review.show_keys ? ["No", "Tipe", "Jawaban", "Kunci", "Status", "Poin"] : ["No", "Tipe", "Jawaban", "Status", "Poin"],
      body: items.map((it, i) => {
        const pts = SURVEY_TYPES.has(it.type) ? "—" : `${it.answer.points_awarded === null ? "?" : formatScore(it.answer.points_awarded)}/${formatScore(it.points)}`;
        const key = keySummary(it.type, it.options.map((o, k) => ({ label: o.label, is_correct: !!o.is_correct, match_text: o.match_text, position: k })), it.accepted_answers ?? []);
        return review.show_keys
          ? [i + 1, QUESTION_TYPE_LABEL[it.type], answerText(it), key, status(it), pts]
          : [i + 1, QUESTION_TYPE_LABEL[it.type], answerText(it), status(it), pts];
      }),
    }, ...(items.some((it) => it.answer.teacher_feedback) ? [{
      heading: "Catatan guru",
      items: items.map((it, i) => ({ it, i })).filter(({ it }) => it.answer.teacher_feedback).map(({ it, i }) => ({ title: `Soal ${i + 1}`, text: it.answer.teacher_feedback! })),
    }] : [])],
  };
}
