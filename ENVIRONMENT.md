# Environment variables

| Variabel | Wajib | Terekspos ke browser | Keterangan |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | Ya | URL project (`https://<ref>.supabase.co`) — Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ya | Ya | Publishable key (`sb_publishable_…`) atau legacy anon key. Aman di browser karena seluruh data dilindungi RLS. |
| `NEXT_PUBLIC_SITE_URL` | Disarankan | Ya | URL publik aplikasi tanpa `/` di akhir (mis. `https://eduquiz.vercel.app`). Dipakai di tautan email. Jika kosong di Vercel, otomatis memakai domain produksi Vercel. |
| `SUPABASE_SERVICE_ROLE_KEY` | Tidak | **Tidak — server saja** | Mengaktifkan pengiriman email undangan otomatis. Tanpa ini, undangan tetap berfungsi melalui kode/tautan. Jangan pernah diberi prefix `NEXT_PUBLIC_`. |

Khusus skrip/tes (tidak dipakai aplikasi):

| Variabel | Dipakai oleh |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EDUQUIZ_ALLOW_TEST_SEED=yes`, `E2E_PASSWORD` | `scripts/seed-test-accounts.ts` |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` | `scripts/test-db.sh` |
| `E2E_BASE_URL`, `E2E_FULL`, `E2E_TEACHER_EMAIL`, `E2E_STUDENT_EMAIL`, `E2E_PASSWORD` | Playwright |

Lokal: salin `.env.example` → `.env.local`. Produksi: atur di Vercel → Project → Settings → Environment Variables (Production & Preview).
