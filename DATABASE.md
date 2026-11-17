# Database — EDUQUIZ

PostgreSQL (Supabase). Semua skema dibuat oleh migrasi di `supabase/migrations/` — tidak ada tabel yang dibuat manual.

| Migrasi | Isi |
|---|---|
| `…0001_schema.sql` | enum, 20 tabel, index, constraint, trigger `updated_at` |
| `…0002_rls.sql` | helper otorisasi, privilege per kolom, RLS seluruh tabel, trigger konsistensi tenant |
| `…0003_functions.sql` | RPC: onboarding, undangan, manajemen kuis, sesi kuis, penilaian, gamifikasi, dasbor, leaderboard, job terjadwal |
| `…0004_realtime_storage_cron.sql` | katalog achievement, publikasi Realtime, bucket `quiz-media` + policy, pg_cron |
| `…0005_question_builder.sql` | `save_question` (soal + opsi atomik) |

## Tabel & relasi

Semua primary key berupa UUID. Setiap tabel milik tenant menyimpan `school_id`.

```
schools 1─* school_members *─1 profiles (1:1 auth.users)
schools 1─* school_invitations ─0..1 classes
schools 1─* classes 1─* class_students *─1 profiles
schools 1─* subjects
teacher_subjects: profiles(guru) × subjects × classes
quizzes (school, teacher, subject) 1─* quiz_questions 1─* question_options
quizzes 1─* quiz_assignments *─1 classes
quizzes 1─* quiz_attempts (student) 1─* student_answers
quiz_attempts 1─1 quiz_results
achievements 1─* student_achievements *─1 profiles
xp_ledger (idempotensi XP) · notifications · activity_logs (audit)
```

Tabel wajib (18) ada semua, ditambah `school_invitations` (onboarding aman) dan `xp_ledger` (mencegah XP ganda).

Constraint penting:
- `quiz_attempts_one_open_uq` — maksimal satu pengerjaan berjalan per siswa per kuis (mencegah start ganda bersamaan).
- `quiz_results.attempt_id unique` — satu hasil per pengerjaan.
- `xp_ledger (student_id, source_type, source_id) unique` — XP sekali per kuis & per achievement.
- `notifications (user_id, dedupe_key)` — notifikasi tidak terduplikasi.
- `student_answers (attempt_id, question_id) unique` — autosave melakukan upsert.

## Aturan penilaian (`_grade_question`)

| Tipe | Aturan |
|---|---|
| Pilihan ganda / Benar-salah | Tepat satu opsi benar dipilih → bobot penuh, selain itu 0 |
| Pilihan ganda kompleks | `bobot × max(0, (benar_dipilih − salah_dipilih) / total_benar)` — dibulatkan 2 desimal. Memilih semua opsi tidak menguntungkan. |
| Jawaban singkat / isian | Dicocokkan dengan kunci setelah normalisasi (trim, spasi ganda → satu, case-insensitive kecuali diaktifkan). Tidak cocok → 0, atau **menunggu koreksi manual** jika opsi koreksi manual aktif / tidak ada kunci. |

Nilai = `poin diperoleh / total poin × 100`. Lulus jika ≥ passing grade. Jawaban yang menunggu koreksi dihitung 0 sementara; setelah guru menilai (`grade_answer`) hasil dihitung ulang, XP diberikan, dan siswa diberi notifikasi.

Seluruh perhitungan berjalan di database. `_finalize_attempt` mengunci baris pengerjaan (`FOR UPDATE`) sehingga submit ganda/bersamaan menghasilkan tepat satu hasil.

## Sesi kuis

1. `start_attempt(quiz | code)` — validasi peran siswa, sekolah aktif, status & jadwal, penugasan/kode, batas percobaan; membuat urutan soal/opsi (acak bila diatur) dan `expires_at = min(now + durasi, end_at)`. Pengerjaan yang masih berjalan dilanjutkan (refresh-safe).
2. `get_attempt` — soal **tanpa** kunci, jawaban tersimpan, waktu server.
3. `save_answer` — autosave per soal; menolak opsi asing; setelah `expires_at + 30 detik` pengerjaan otomatis dikumpulkan.
4. `submit_attempt` — idempotent.
5. `run_scheduled_jobs` (pg_cron tiap menit) — auto-submit pengerjaan kedaluwarsa, notifikasi kuis dimulai & pengingat tenggat (≤ 60 menit).

## Gamifikasi

- XP per kuis (sekali per siswa per kuis, retake tidak menambah): `10 + round(nilai/10) + 20 jika lulus`.
- Level: `floor(sqrt(xp/50)) + 1`.
- Streak harian berdasarkan zona waktu sekolah.
- Achievement: first_quiz, first_pass, perfect_score, five_quizzes, twenty_quizzes, streak_3, streak_7, speedster, level_5.
- Leaderboard memakai XP per sekolah (`xp_ledger.school_id`) dan menghormati `leaderboard_enabled` / `leaderboard_show_names`.

## Status migrasi

Semua migrasi diterapkan dan diuji otomatis pada PostgreSQL 16 dengan emulasi auth Supabase (`tests/db/supabase-shim.sql`). Penerapan ke Supabase Cloud: lihat DEPLOYMENT.md.
