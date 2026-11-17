import type { StudentQuizState } from "./student-queries";

export const STATE_META: Record<StudentQuizState, { label: string; tone: "green" | "brand" | "amber" | "violet" | "slate" }> = {
  available: { label: "Tersedia", tone: "green" },
  in_progress: { label: "Sedang dikerjakan", tone: "brand" },
  scheduled: { label: "Terjadwal", tone: "amber" },
  completed: { label: "Selesai", tone: "violet" },
  ended: { label: "Berakhir", tone: "slate" },
};
