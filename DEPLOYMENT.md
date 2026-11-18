# Deployment — EDUQUIZ

Target: **GitHub** (kode) → **Vercel** (frontend/serverless) + **Supabase Cloud** (database, auth, realtime, storage).

## 1. Supabase Cloud

1. Buat project (region disarankan `ap-southeast-1` Singapore). Catat *project ref*.
2. Terapkan migrasi:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push          # menerapkan supabase/migrations/* berurutan
   ```
   Alternatif: jalankan isi tiap file migrasi berurutan di SQL Editor.
3. Pastikan ekstensi **pg_cron** aktif (Database → Extensions). Migrasi 0004 menjadwalkan `eduquiz-jobs` tiap menit; cek dengan `select * from cron.job;`.
4. **Authentication → URL Configuration**
   - Site URL: `https://<domain-produksi>`
   - Redirect URLs: `https://<domain-produksi>/auth/confirm`, `https://*-<akun>.vercel.app/auth/confirm` (preview), `http://localhost:3000/auth/confirm`
5. **Authentication → Providers → Email**: aktifkan *Confirm email*; minimum password 8.
6. Disarankan: atur SMTP sendiri (Authentication → Emails → SMTP) — SMTP bawaan Supabase dibatasi beberapa email per jam.
7. **Database → Advisors**: jalankan Security & Performance advisor, pastikan tidak ada temuan RLS.
8. Super Admin pertama: daftar lewat aplikasi, lalu di SQL Editor:
   ```sql
   update public.profiles set is_super_admin = true where email = 'admin@domainanda.id';
   ```

## 2. GitHub

Repository: `ibnumuklis/eduquiz` (privat). CI (`.github/workflows/ci.yml`) menjalankan lint, typecheck, unit test, tes migrasi+RLS pada PostgreSQL, dan build.

## 3. Vercel

Status saat ini: project `eduquiz` (team `ulfa-mafridoh`), produksi di **https://eduquiz-sand-pi.vercel.app**,
region fungsi **hnd1 (Tokyo)** — sama dengan region Supabase (`ap-northeast-1`) agar latensi database rendah.
Supabase project ref: `fzqunwwdeuoqcyckyyfj`.

> Penting: Settings → Deployment Protection → **Vercel Authentication** harus "Only Preview Deployments"
> (atau dimatikan). Mode bawaan "All except custom domains" membuat domain `*.vercel.app` produksi meminta
> login Vercel sehingga guru/siswa tidak bisa masuk.

1. Import repository GitHub → framework Next.js (otomatis).
2. Environment variables (Production & Preview) — lihat ENVIRONMENT.md:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, opsional `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy. Setiap push ke `main` → produksi; PR → preview.
4. Domain kustom: Project → Settings → Domains, lalu perbarui Site URL & Redirect URLs di Supabase.

## 4. Verifikasi produksi

- `GET https://<domain>/api/health` → `{"status":"ok"}`
- `E2E_BASE_URL=https://<domain> npx playwright test tests/e2e/smoke.spec.ts`
- Akun uji (project staging disarankan):
  `EDUQUIZ_ALLOW_TEST_SEED=yes SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed:test`
  lalu `E2E_FULL=1 E2E_BASE_URL=… E2E_TEACHER_EMAIL=guru@eduquiz.test E2E_STUDENT_EMAIL=siswa@eduquiz.test E2E_PASSWORD=… npx playwright test`
  Hapus setelahnya: `npm run seed:test -- --remove`.
- Uji manual per peran: daftar → buat sekolah → undang guru & siswa → buat & publikasikan kuis → kerjakan → monitoring → ekspor.

## 5. Onboarding admin sekolah

1. Admin mendaftar di `/register`, verifikasi email, pilih **Daftarkan sekolah baru** → otomatis menjadi Admin Sekolah.
   (Atau Super Admin menetapkan admin lewat **Manajemen Sekolah → Tetapkan administrator**.)
2. **Pengaturan Sekolah**: zona waktu, tahun ajaran, semester, privasi leaderboard.
3. **Mata Pelajaran** dan **Kelas**.
4. **Undangan**: buat kode guru; untuk siswa impor CSV (`email,full_name,student_number,class_name`) atau buat kode kelas multi-pakai.
5. **Guru & Staf**: tugaskan guru ke mapel + kelas (menentukan kelas yang dapat diberi kuis oleh guru).
6. Siswa mendaftar dengan email yang diundang → otomatis masuk sekolah & kelas.

## Rollback

- Vercel: Deployments → pilih deployment sebelumnya → *Promote to Production*.
- Database: tulis migrasi baru yang membalik perubahan (jangan mengedit migrasi yang sudah diterapkan). Aktifkan Point-in-Time Recovery pada plan berbayar.
