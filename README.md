# EDUQUIZ — Learn. Play. Achieve.

Platform kuis interaktif multi-sekolah: guru membuat, membagikan, memantau, dan menilai kuis; siswa mengerjakan dengan pengalaman yang nyaman dan gamified (XP, level, badge, streak, leaderboard).

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind CSS 4) · Supabase (PostgreSQL, Auth, Realtime, Storage, RLS) · Zod · React Hook Form · Recharts · Sonner · Vercel.

## Fitur

| Peran | Fitur |
|---|---|
| **Super Admin** | Statistik platform, manajemen sekolah (aktif/nonaktif), penetapan administrator, audit log lintas sekolah |
| **Admin Sekolah** | Profil & tahun ajaran, guru & staf (peran/status/penugasan mengajar), siswa, kelas & anggota, mata pelajaran, undangan aman + impor CSV dengan laporan kesalahan, log aktivitas, privasi leaderboard. Juga memiliki seluruh alat guru. |
| **Guru** | Dasbor (statistik, grafik aktivitas & distribusi nilai), manajemen kuis (draft, publikasi, jadwal, tutup, duplikasi, hapus), question builder 5 tipe soal (pilihan ganda, pilihan ganda kompleks, benar/salah, jawaban singkat, isian) dengan gambar, bobot, pembahasan, urutkan & duplikasi soal, preview, penugasan kelas + kode akses, **monitoring realtime**, laporan nilai (rata-rata, tertinggi, terendah, ranking, distribusi, riwayat) + **ekspor CSV/Excel**, koreksi manual, bank soal |
| **Siswa** | Dasbor gamified, daftar & detail kuis, gabung dengan kode, pengerjaan dengan timer server, autosave, pemulihan sesi, mode offline, auto-submit, hasil & pembahasan (sesuai izin guru), riwayat, pencapaian, leaderboard |

## Struktur

```
src/
  app/              (auth) login/register/forgot/reset/verify · (dashboard) admin|school|teacher|student
                    attempt/[id] (mode fokus) · api/reports/[quizId] · auth/confirm · onboarding
  components/       ui/ dashboard/ quiz/ forms/ charts/
  features/         auth/ schools/ quizzes/ attempts/ reports/  (server actions & queries)
  lib/              supabase/ (server, browser, admin) · permissions/ · validations/ · utils/
  proxy.ts          refresh sesi + proteksi route
supabase/
  migrations/       seluruh skema, RLS, fungsi RPC, storage, realtime, pg_cron
  config.toml  seed.sql
tests/
  unit/             logika murni (vitest)
  integration/      RLS, isolasi sekolah, kunci jawaban, penilaian (PostgreSQL + vitest)
  e2e/              Playwright: smoke (desktop/tablet/mobile) + alur penuh guru→siswa
```

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local        # isi URL & publishable key Supabase
npm run dev
```

Terapkan migrasi ke project Supabase: `supabase link --project-ref <ref> && supabase db push` (lihat **DEPLOYMENT.md**).

## Pengujian

```bash
npm run lint && npm run typecheck
npm test                             # unit tests
PGHOST=/tmp PGPORT=5432 npm run test:db   # migrasi + 47 tes RLS/keamanan/penilaian pada PostgreSQL
npm run build && npm run test:e2e    # smoke E2E di 3 ukuran layar
E2E_FULL=1 E2E_TEACHER_EMAIL=guru@eduquiz.test E2E_STUDENT_EMAIL=siswa@eduquiz.test E2E_PASSWORD=... npm run test:e2e
```

## Dokumentasi

- [DATABASE.md](DATABASE.md) — tabel, relasi, aturan penilaian, fungsi RPC
- [SECURITY.md](SECURITY.md) — model otorisasi, RLS, pengujian keamanan
- [DEPLOYMENT.md](DEPLOYMENT.md) — Supabase Cloud, GitHub, Vercel, onboarding admin
- [ENVIRONMENT.md](ENVIRONMENT.md) — variabel lingkungan
