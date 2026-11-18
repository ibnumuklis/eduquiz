# EDUQUIZ — Learn. Play. Achieve.

Platform kuis interaktif multi-sekolah: guru membuat, membagikan, memantau, dan menilai kuis; siswa mengerjakan dengan pengalaman yang nyaman dan gamified (XP, level, badge, streak, leaderboard).

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind CSS 4) · Supabase (PostgreSQL, Auth, Realtime, Storage, RLS) · Zod · React Hook Form · Recharts · Sonner · Vercel.

## Fitur

| Peran | Fitur |
|---|---|
| **Super Admin** | Statistik platform, manajemen sekolah (aktif/nonaktif), penetapan administrator, audit log lintas sekolah |
| **Admin Sekolah** | Profil & tahun ajaran, guru & staf (peran/status/penugasan mengajar), siswa, kelas & anggota, mata pelajaran, undangan aman + impor CSV dengan laporan kesalahan, log aktivitas, privasi leaderboard. Juga memiliki seluruh alat guru. |
| **Guru** | Dasbor (statistik, grafik aktivitas & distribusi nilai), manajemen kuis (draft, publikasi, jadwal, tutup, duplikasi, hapus), question builder **11 tipe soal** termasuk format AKM (pilihan ganda, PG kompleks, benar/salah, **PGK Benar/Salah grid, menjodohkan, mengurutkan**, jawaban singkat, isian rumpang, **uraian + rubrik**, **polling & word cloud**) dengan gambar, **stimulus/bacaan bersama**, tautan **TP/CP Kurikulum Merdeka**, petunjuk, pembahasan; **impor Excel/CSV** dengan template; **mode Standar / Latihan (tuntas & remedial) / Ujian**; **anti-curang** (layar penuh, catat pindah tab, tanda air, blok salin-tempel saat ujian); **akomodasi siswa** (waktu tambahan, kurangi opsi, bacakan soal); **power-up positif** & umpan balik langsung; tema tampilan; folder kuis; **cetak lembar kerja / PDF** + kunci; preview, penugasan kelas + kode akses, **monitoring realtime**, laporan nilai (rata-rata, tertinggi, terendah, ranking, distribusi, riwayat) + **ekspor CSV/Excel**, **analisis: heatmap siswa × soal, tingkat kesukaran & daya beda, analisis pengecoh, ketuntasan per TP, draf deskripsi rapor**, koreksi manual dengan rubrik & umpan balik, bank soal pribadi + **bank soal bersama sekolah**; **rumus matematika (LaTeX/KaTeX)** dan **soal audio** (listening, batas putar); **alarm anti-curang** (sirene saat keluar layar penuh/pindah tab/split-screen/pintasan tangkap layar); **Mode Live** (layar proyektor, kode 6 angka, skor ketepatan + kecepatan, podium); **Rapor TP lintas kuis per semester** + draf deskripsi rapor; **unduh laporan PDF** (hasil, analisis, ranking, rapor) |
| **Siswa** | Dasbor gamified, daftar & detail kuis, gabung dengan kode, pengerjaan dengan timer server, autosave, pemulihan sesi, mode offline, auto-submit, hasil & pembahasan (sesuai izin guru), latihan ulang sampai tuntas, skor game terpisah dari nilai, bacakan soal dengan suara terbaik per bahasa (deteksi kalimat Inggris otomatis, pilih suara & kecepatan), **gabung Live**, unduh hasil PDF, riwayat, pencapaian, leaderboard, **instal sebagai aplikasi (PWA)** |

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
