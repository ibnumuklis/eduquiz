# Security — EDUQUIZ

## Prinsip

1. **Database adalah batas keamanan.** Menu yang disembunyikan dan guard di server hanya lapis pertama; setiap baca/tulis tetap melewati Row Level Security dan pemeriksaan di fungsi RPC.
2. **Browser tidak dipercaya.** Nilai, kunci jawaban, waktu pengerjaan, dan XP dihitung di database.
3. **Least privilege.** Klien hanya punya hak `UPDATE`/`INSERT` pada kolom tertentu; kolom sensitif (`role`, `is_super_admin`, `xp`, `school_id`, `teacher_id`, `status` sekolah) tidak bisa disentuh dari API.

## Autentikasi

- Supabase Auth (email + password, verifikasi email, reset password, PKCE). Tautan email ditangani `/auth/confirm` dengan redirect yang divalidasi (`safeRedirect`, anti open-redirect).
- `src/proxy.ts` menyegarkan sesi dan mengalihkan pengguna tanpa sesi dari seluruh area terproteksi.
- Ganti password memerlukan password saat ini. Lupa password selalu memberi respons yang sama (tidak membocorkan email terdaftar).
- Onboarding siswa/guru memakai **kode undangan** acak 8 karakter (sekali pakai bila terikat email; email harus terverifikasi). Tidak ada password default bersama.

## Otorisasi

Peran per sekolah (`school_members.role`): `school_admin`, `teacher`, `student`. Super Admin = `profiles.is_super_admin` (hanya bisa diubah langsung di database).

Helper `SECURITY DEFINER` (hanya menjawab tentang pengguna yang memanggil): `is_super_admin`, `member_role`, `is_member`, `is_school_admin`, `is_staff`, `teaches_class`, `in_class`, `can_manage_quiz`, `student_can_view_quiz`, `can_view_profile`. Keanggotaan di sekolah **nonaktif** tidak memberi akses.

| Data | Siapa yang bisa membaca |
|---|---|
| Sekolah | anggota, super admin |
| Kelas / anggota kelas | admin sekolah, guru yang mengajar kelas / wali kelas, siswa kelas tsb |
| Kuis | pemilik (guru), admin sekolah, siswa yang ditugaskan / sudah mengerjakan |
| Soal, opsi, **kunci jawaban** | **hanya** pemilik kuis & admin sekolah (siswa: 0 baris) |
| Pengerjaan & jawaban | siswa ybs (lewat RPC), pengelola kuis |
| Nilai | pengelola kuis; siswa hanya bila guru mengizinkan `show_result` |
| Audit log | admin sekolah (sekolahnya), super admin |

Siswa melihat soal melalui `get_attempt` (tanpa kunci) dan pembahasan melalui `get_attempt_review` (kunci hanya bila `show_explanation`).

Fungsi internal (`_finalize_attempt`, `_award_xp`, `_grade_question`, `notify`, `log_activity`, dll.) di-`REVOKE` dari `anon`/`authenticated`. Peran `anon` tidak memiliki hak apa pun pada tabel atau fungsi.

## Integritas tenant

Trigger memaksa `school_id` anak mengikuti induknya (soal → kuis, opsi → soal, penugasan → kuis) dan menolak relasi lintas sekolah (kelas sekolah lain, mapel sekolah lain, wali kelas bukan staf). Admin tidak dapat mengubah perannya sendiri dan sekolah selalu memiliki minimal satu admin aktif.

## Storage

Bucket `quiz-media` **privat**, maks 5 MB, hanya gambar. Path `<school_id>/<quiz_id>/<file>`; unggah/ubah/hapus hanya oleh pengelola kuis tsb, baca hanya anggota sekolah. Gambar ditampilkan melalui signed URL berumur pendek.

## Secrets

- Frontend hanya memakai `NEXT_PUBLIC_SUPABASE_URL` dan publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY` hanya di server (`src/lib/supabase/admin.ts`, `import "server-only"`), opsional, dipakai semata untuk mengirim email undangan setelah izin diverifikasi RLS.
- `.env*` di-gitignore; `.env.example` tanpa nilai asli.

## Header & lain-lain

HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; header `X-Powered-By` dimatikan. Ekspor CSV menetralkan formula injection. Pesan error database dipetakan ke pesan aman (tanpa detail internal).

## Pengujian keamanan (otomatis)

`tests/integration/security-and-grading.test.ts` — 48 tes, dijalankan pada setiap CI:
- akses anonim ke tabel & RPC ditolak
- eskalasi hak: jadi super admin, ubah XP, ubah peran sendiri, ubah status sekolah
- isolasi lintas sekolah (baca kuis/kelas/anggota/profil, buat kuis, tugaskan kelas, masuk dengan kode)
- kerahasiaan kunci jawaban & pembahasan
- manipulasi nilai/attempt langsung, pemanggilan fungsi internal
- double submit bersamaan, XP farming, batas percobaan, auto-submit kedaluwarsa
- undangan: email lain, email belum terverifikasi, pemakaian ulang, guru membuat undangan
- privasi leaderboard, perlindungan admin terakhir

`tests/integration/learning-features.test.ts` — 19 tes: payload siswa tanpa kunci untuk tipe AKM (termasuk pemetaan menjodohkan), validasi jawaban terstruktur, penilaian parsial, remedial & penguasaan, mode ujian tanpa XP/power-up, power-up sekali pakai & tidak pernah menyembunyikan kunci, kunci tidak bocor selama Kesempatan Kedua tersedia, kejadian integritas hanya dapat ditulis lewat RPC oleh pemilik attempt dan hanya dibaca guru pengelola, akomodasi hanya oleh staf sekolah yang sama, TP lintas sekolah ditolak, folder milik guru lain ditolak, impor per baris.

E2E smoke (`tests/e2e/smoke.spec.ts`) memverifikasi semua area peran & API laporan tertutup tanpa sesi, serta header keamanan.

## Privasi fitur baru

- `integrity_events` tidak memiliki grant INSERT/UPDATE untuk klien; satu-satunya jalur tulis adalah `log_integrity_event` yang memeriksa kepemilikan attempt. Data ini adalah sinyal untuk percakapan guru–siswa, bukan bukti tunggal.
- `student_accommodations` hanya terlihat oleh siswa bersangkutan dan staf sekolahnya.
- Service worker (`public/sw.js`) hanya meng-cache aset statis & halaman offline — halaman, API, dan lalu lintas Supabase tidak pernah di-cache.
- Bacakan soal memakai Web Speech API bawaan browser; teks tidak dikirim ke server EDUQUIZ.

## Melaporkan celah

Hubungi pengelola repository secara privat; jangan membuka issue publik.

## Mode Live & bank sekolah

- Kunci jawaban Live tidak dikirim ke siswa sebelum tahap *reveal*; `live_state` menyaring per peran (host/pemain).
- Skor dihitung di server (`live_answer`) dari jam server, sehingga waktu/klik dari klien tidak bisa dimanipulasi.
- Tabel Live hanya bisa dibaca peserta/host sesi itu; tidak ada izin INSERT/UPDATE langsung.
- Bank soal bersama hanya untuk staf sekolah yang sama dan hanya kuis yang ditandai `shared_with_school`.
- Alarm anti-curang hanya **sinyal** di perangkat siswa; keputusan tetap di guru melalui log integritas.
