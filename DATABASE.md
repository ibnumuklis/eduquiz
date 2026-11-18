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
| PGK Benar/Salah (`tf_grid`) | Setiap opsi = pernyataan; `is_correct` = kunci Benar. Nilai `bobot × pernyataan_tepat / jumlah_pernyataan`. Jawaban di `student_answers.answer_data` (`{option_id: boolean}`). |
| Menjodohkan (`matching`) | Opsi = sisi kiri, `match_text` = pasangan. Nilai `bobot × pasangan_tepat / jumlah_pasangan` (perbandingan tanpa beda huruf besar/kecil). Siswa hanya melihat daftar pasangan teracak, bukan pemetaannya. |
| Mengurutkan (`ordering`) | `position` opsi = urutan benar; opsi selalu diacak saat disajikan. Nilai `bobot × item_di_posisi_benar / jumlah_item`. |
| Uraian (`essay`) | Selalu koreksi manual. Rubrik (`quiz_questions.payload.rubric`) memandu guru; skor per kriteria disimpan di `rubric_scores`, umpan balik di `teacher_feedback`. |
| Polling / word cloud | Tidak dinilai: tidak masuk total poin maupun hitungan benar/salah. |

Nilai = `poin diperoleh / total poin × 100`. Lulus jika ≥ passing grade. Jawaban yang menunggu koreksi dihitung 0 sementara; setelah guru menilai (`grade_answer`) hasil dihitung ulang, XP diberikan, dan siswa diberi notifikasi.

Seluruh perhitungan berjalan di database. `_finalize_attempt` mengunci baris pengerjaan (`FOR UPDATE`) sehingga submit ganda/bersamaan menghasilkan tepat satu hasil.

### Mode kuis & skor

- **Standar** — perilaku biasa.
- **Latihan (`practice`)** — tanpa batas percobaan (maks. 50). Setelah percobaan pertama, `start_attempt` hanya menyajikan soal yang belum dikuasai (`is_remedial`). Nilai = **penguasaan kumulatif**: poin terbaik per soal dari seluruh percobaan ÷ total poin. `mastered` = nilai ≥ `mastery_target`. Nilai & pembahasan selalu ditampilkan.
- **Ujian (`exam`)** — power-up & umpan balik langsung dimatikan (trigger `tg_quiz_mode`), tidak ada XP/pencapaian, `game_score = 0`.
- `quiz_results.game_score` = akurasi × 1000 + bonus kecepatan (maks. 500). Hanya untuk gamifikasi; **nilai rapor tetap `score`**.

### Integritas, akomodasi, power-up

- `log_integrity_event` mencatat `tab_hidden`, `window_blur`, `fullscreen_exit`, `copy`, `paste`, `context_menu` ke `integrity_events` dan menaikkan `quiz_attempts.integrity_count` (tampil realtime di Monitoring; notifikasi guru pada kejadian ke-3). Tidak ada sanksi otomatis.
- `student_accommodations` (per siswa per sekolah): `time_multiplier` (1–3) diterapkan ke `expires_at`, `reduce_options` menyisakan ±½ opsi pilihan ganda (kunci selalu ada), `read_aloud` mengaktifkan pembacaan otomatis.
- `use_powerup` — `fifty_fifty` (menyembunyikan ≤2 opsi salah, disimpan di `hidden_options`), `hint` (`payload.hint`), `second_chance` (membuka kunci jawaban yang salah). Masing-masing sekali per pengerjaan.
- `check_answer` (bila `instant_feedback`) menilai satu jawaban lalu menguncinya (`student_answers.locked`). Kunci jawaban tidak ditampilkan selama siswa masih punya Kesempatan Kedua.

### Analisis

`get_quiz_analysis(quiz)` (hanya pengelola kuis) mengembalikan heatmap siswa × soal (rasio 0–1; −1 kosong; −2 menunggu koreksi), p-value per soal, jumlah pemilih per opsi (analisis pengecoh), kata terbanyak (word cloud/isian), dan TP terkait. Daya beda (kelompok atas–bawah 27%), ketuntasan per TP, dan draf deskripsi rapor dihitung di `src/lib/utils/analysis.ts`.

### Impor soal

`import_questions(quiz, rows)` memanggil `save_question` per baris di dalam sub-transaksi — baris gagal tidak membatalkan baris lain dan dilaporkan dengan nomor baris. File Excel/CSV diurai di `src/lib/import/questions.ts` (template: `/api/templates/questions`).

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
- Achievement: first_quiz, first_pass, perfect_score, five_quizzes, twenty_quizzes, streak_3, streak_7, speedster, level_5, practice_master.
- Leaderboard memakai XP per sekolah (`xp_ledger.school_id`) dan menghormati `leaderboard_enabled` / `leaderboard_show_names`.

## Status migrasi

Semua migrasi diterapkan dan diuji otomatis pada PostgreSQL 16 dengan emulasi auth Supabase (`tests/db/supabase-shim.sql`). Penerapan ke Supabase Cloud: lihat DEPLOYMENT.md.
