const LABELS: Record<string, string> = {
  "school.created": "Sekolah dibuat",
  "school.status_changed": "Status sekolah diubah",
  "invitation.created": "Undangan dibuat",
  "invitation.accepted": "Undangan diterima",
  "member.admin_assigned": "Admin ditetapkan",
  "quiz.published": "Kuis dipublikasikan",
  "quiz.closed": "Kuis ditutup",
  "quiz.duplicated": "Kuis diduplikasi",
  "attempt.started": "Siswa mulai kuis",
  "attempt.submitted": "Kuis dikumpulkan",
  "answer.graded": "Jawaban dinilai manual",
};
export function activityLabel(action: string) {
  return LABELS[action] ?? action;
}
