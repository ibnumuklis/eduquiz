import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { getManagedQuiz, getQuizQuestions, getQuizStimuli } from "@/features/quizzes/queries";
import { QUESTION_TYPE_LABEL, SURVEY_TYPES } from "@/lib/validations/quiz";
import { keySummary } from "@/lib/utils/quiz";
import { PrintToolbar } from "./print-toolbar";

export const metadata: Metadata = { title: "Cetak Lembar Kerja" };

const INSTRUCTION: Record<string, string> = {
  multiple_choice: "Beri tanda silang (X) pada satu jawaban yang paling tepat.",
  multiple_select: "Beri tanda centang (✓) pada SEMUA jawaban yang benar.",
  true_false: "Lingkari B jika benar atau S jika salah.",
  tf_grid: "Beri tanda centang pada kolom Benar atau Salah untuk setiap pernyataan.",
  matching: "Pasangkan dengan menuliskan huruf jawaban yang sesuai.",
  ordering: "Tuliskan nomor urut yang benar pada kotak.",
};

export default async function PrintQuizPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kunci?: string }> }) {
  const session = await requireSchoolRole("teacher");
  const { id } = await params;
  const { kunci } = await searchParams;
  const withKey = kunci === "1";
  const quiz = await getManagedQuiz(id);
  const [questions, stimuli] = await Promise.all([getQuizQuestions(id), getQuizStimuli(id)]);
  const stimById = new Map(stimuli.map((s) => [s.id, s]));
  const shown = new Set<string>();
  const school = session.activeMembership?.school.name ?? "";

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <PrintToolbar quizId={id} withKey={withKey} />
      <article className="mx-auto my-6 max-w-[210mm] bg-white p-[15mm] text-[11pt] leading-relaxed text-black shadow print:my-0 print:p-0 print:shadow-none">
        <header className="border-b-2 border-black pb-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide">{school}</p>
          <h1 className="mt-1 text-xl font-bold">{quiz.title}{withKey && " — KUNCI JAWABAN"}</h1>
          <p className="text-sm">{quiz.subject?.name ?? ""}{quiz.subject ? " · " : ""}Waktu {quiz.duration_minutes} menit</p>
        </header>
        {!withKey && (
          <table className="mt-3 w-full text-sm">
            <tbody>
              <tr><td className="w-24 py-1">Nama</td><td className="border-b border-dotted border-black">&nbsp;</td><td className="w-8" /><td className="w-16 py-1">Kelas</td><td className="w-40 border-b border-dotted border-black">&nbsp;</td></tr>
              <tr><td className="py-1">No. absen</td><td className="border-b border-dotted border-black">&nbsp;</td><td /><td className="py-1">Tanggal</td><td className="border-b border-dotted border-black">&nbsp;</td></tr>
            </tbody>
          </table>
        )}
        {quiz.description && <p className="mt-3 whitespace-pre-wrap text-sm italic">{quiz.description}</p>}

        <ol className="mt-5 space-y-5">
          {questions.map((q, i) => {
            const stim = q.stimulus_id ? stimById.get(q.stimulus_id) : null;
            const showStim = stim && !shown.has(stim.id);
            if (stim) shown.add(stim.id);
            const opts = q.question_options;
            return (
              <li key={q.id} className="break-inside-avoid">
                {showStim && stim && (
                  <div className="mb-3 rounded border border-black p-3 text-sm">
                    {stim.title && <p className="mb-1 font-bold">{stim.title}</p>}
                    <p className="whitespace-pre-wrap">{stim.content}</p>
                    {stim.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={stim.image_url} alt="" className="mt-2 max-h-64" />
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="font-bold">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap">{q.prompt}</p>
                    {INSTRUCTION[q.type] && <p className="text-xs italic text-slate-600">{INSTRUCTION[q.type]}</p>}
                    {q.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.image_url} alt="" className="mt-2 max-h-56" />
                    )}
                    {(q.type === "multiple_choice" || q.type === "multiple_select" || q.type === "poll") && (
                      <ol className="mt-1 grid gap-x-6 sm:grid-cols-2 print:grid-cols-2">
                        {opts.map((o, k) => <li key={o.id} className={withKey && o.is_correct ? "font-bold underline" : ""}>{String.fromCharCode(65 + k)}. {o.label}</li>)}
                      </ol>
                    )}
                    {q.type === "true_false" && <p className="mt-1">B &nbsp;/&nbsp; S</p>}
                    {q.type === "tf_grid" && (
                      <table className="mt-1 w-full border-collapse text-sm">
                        <thead><tr><th className="border border-black px-2 text-left">Pernyataan</th><th className="w-16 border border-black">Benar</th><th className="w-16 border border-black">Salah</th></tr></thead>
                        <tbody>{opts.map((o, k) => (
                          <tr key={o.id}><td className="border border-black px-2">{k + 1}. {o.label}</td>
                            <td className="border border-black text-center">{withKey && o.is_correct ? "✓" : ""}</td>
                            <td className="border border-black text-center">{withKey && !o.is_correct ? "✓" : ""}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                    {q.type === "matching" && (() => {
                      const right = [...opts.map((o) => o.match_text ?? "")].sort((a, b) => a.localeCompare(b, "id"));
                      return (
                        <div className="mt-1 grid grid-cols-2 gap-6 text-sm">
                          <ol>{opts.map((o, k) => <li key={o.id}>{k + 1}. {o.label} &nbsp;[ {withKey ? String.fromCharCode(65 + right.indexOf(o.match_text ?? "")) : "   "} ]</li>)}</ol>
                          <ol>{right.map((r, k) => <li key={k}>{String.fromCharCode(65 + k)}. {r}</li>)}</ol>
                        </div>
                      );
                    })()}
                    {q.type === "ordering" && (
                      <ul className="mt-1 text-sm">
                        {[...opts].sort((a, b) => a.label.localeCompare(b.label, "id")).map((o) => (
                          <li key={o.id}>[ {withKey ? opts.findIndex((x) => x.id === o.id) + 1 : "  "} ] {o.label}</li>
                        ))}
                      </ul>
                    )}
                    {(q.type === "short_answer" || q.type === "fill_blank" || q.type === "word_cloud") && !withKey && <div className="mt-3 border-b border-dotted border-black">&nbsp;</div>}
                    {q.type === "essay" && !withKey && <div className="mt-2 space-y-5">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="border-b border-dotted border-black">&nbsp;</div>)}</div>}
                    {withKey && !SURVEY_TYPES.has(q.type) && (
                      <p className="mt-1 text-sm"><strong>Kunci:</strong> {keySummary(q.type, opts, q.accepted_answers)} · <em>{Number(q.points)} poin · {QUESTION_TYPE_LABEL[q.type]}</em></p>
                    )}
                    {withKey && q.type === "essay" && q.payload?.rubric?.length ? (
                      <ul className="mt-1 list-inside list-disc text-sm">{q.payload.rubric.map((r, k) => <li key={k}>{r.criterion} ({r.points})</li>)}</ul>
                    ) : null}
                    {withKey && q.explanation && <p className="mt-1 text-sm italic">Pembahasan: {q.explanation}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <footer className="mt-8 border-t pt-2 text-center text-[9pt] text-slate-500">Dibuat dengan EDUQUIZ</footer>
      </article>
    </div>
  );
}
