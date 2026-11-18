import type { Quiz } from "@/types";

export function quizState(q: Pick<Quiz, "status" | "start_at" | "end_at">) {
  const now = Date.now();
  if (q.status === "draft") return { label: "Draft", tone: "slate" as const, key: "draft" };
  if (q.status === "closed") return { label: "Ditutup", tone: "red" as const, key: "closed" };
  if (q.end_at && new Date(q.end_at).getTime() <= now) return { label: "Selesai", tone: "violet" as const, key: "ended" };
  if (q.start_at && new Date(q.start_at).getTime() > now) return { label: "Terjadwal", tone: "amber" as const, key: "scheduled" };
  return { label: "Aktif", tone: "green" as const, key: "active" };
}

interface KeyOption { label: string; is_correct: boolean; match_text?: string | null; position?: number }

/** Human-readable answer key for teacher views (builder, bank, print). */
export function keySummary(type: string, options: KeyOption[], accepted: string[] = []): string {
  const opts = [...options].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  switch (type) {
    case "multiple_choice":
    case "multiple_select":
    case "true_false":
      return opts.filter((o) => o.is_correct).map((o) => o.label).join(", ") || "—";
    case "tf_grid":
      return opts.map((o, i) => `${i + 1}. ${o.is_correct ? "B" : "S"}`).join("  ");
    case "matching":
      return opts.map((o) => `${o.label} → ${o.match_text ?? "?"}`).join("; ");
    case "ordering":
      return opts.map((o) => o.label).join(" → ");
    case "short_answer":
    case "fill_blank":
      return accepted.join(" / ") || "dinilai manual";
    case "essay":
      return "dinilai guru (rubrik)";
    default:
      return "tidak dinilai";
  }
}

/** Indonesian, upbeat feedback lines for game-style moments. Never shaming. */
export const CHEERS = ["Mantap jiwa! 🔥", "Keren abis! ⭐", "Gaskeun terus! 🚀", "Jago bener! 🎯", "Luar biasa! 🏆", "Top markotop! 👏", "Sip, lanjut! 💪"];
export const ENCOURAGE = ["Santuy, coba lagi ya 💪", "Hampir! Sedikit lagi 🌱", "Gapapa, belajar dari sini 📚", "Semangat, kamu bisa! ✨", "Tarik napas, fokus lagi 🧘"];

export function pickLine(list: string[], seed: string | number) {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export function resultMessage(score: number, passed: boolean, mode?: string) {
  if (mode === "exam") return passed ? "Ujian selesai. Hasilmu memenuhi KKM." : "Ujian selesai. Diskusikan hasilnya dengan gurumu.";
  if (score >= 100) return "Sempurna! Kamu menguasai semua materi 🏆";
  if (score >= 85) return "Hebat! Hampir sempurna 🌟";
  if (passed) return "Bagus, kamu tuntas! Pertahankan 👍";
  if (score >= 50) return "Sudah setengah jalan — ulangi bagian yang salah ya 💪";
  return "Jangan menyerah! Pelajari pembahasan lalu coba lagi 📚";
}
