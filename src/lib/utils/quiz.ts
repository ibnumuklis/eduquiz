import type { Quiz } from "@/types";

export function quizState(q: Pick<Quiz, "status" | "start_at" | "end_at">) {
  const now = Date.now();
  if (q.status === "draft") return { label: "Draft", tone: "slate" as const, key: "draft" };
  if (q.status === "closed") return { label: "Ditutup", tone: "red" as const, key: "closed" };
  if (q.end_at && new Date(q.end_at).getTime() <= now) return { label: "Selesai", tone: "violet" as const, key: "ended" };
  if (q.start_at && new Date(q.start_at).getTime() > now) return { label: "Terjadwal", tone: "amber" as const, key: "scheduled" };
  return { label: "Aktif", tone: "green" as const, key: "active" };
}
