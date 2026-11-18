import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { AppRole } from "@/types";

const GUIDES: Record<string, { title: string; steps: string[] }[]> = {
  teacher: [
    { title: "Membuat kuis", steps: ["Menu Kuis Saya → Buat kuis", "Isi judul, durasi, jadwal, passing grade", "Tambahkan soal di tab Soal (11 tipe, atau Impor Excel)", "Gunakan tab Preview untuk mencoba"] },
    { title: "Membagikan kuis", steps: ["Tab Penugasan & Bagikan → pilih kelas", "Atau aktifkan akses kode lalu bagikan kode/tautan", "Klik Publikasikan — siswa menerima notifikasi"] },
    { title: "Melihat hasil", steps: ["Tab Monitoring untuk progres & catatan integritas", "Tab Laporan Nilai & Analisis (unduh PDF/Excel)", "Menu Rapor TP untuk rekap semester", "Koreksi uraian di menu Koreksi Jawaban"] },
    { title: "Kuis Live", steps: ["Buka kuis → tombol Mulai Live", "Tampilkan layar ke proyektor, siswa masuk dengan kode 6 angka", "Klik Mulai, lalu Tampilkan jawaban & Berikutnya", "Skor dihitung dari ketepatan & kecepatan"] },
  ],
  student: [
    { title: "Mengerjakan kuis", steps: ["Buka Dasbor atau menu Kuis", "Pilih kuis tersedia → Mulai kuis", "Jawaban tersimpan otomatis setiap kali memilih", "Klik Kumpulkan setelah selesai"] },
    { title: "Bergabung dengan kode", steps: ["Menu Gabung dengan Kode", "Masukkan kode 6 karakter dari guru", "Kuis langsung dimulai"] },
    { title: "Kuis Live", steps: ["Menu Gabung Live", "Masukkan kode 6 angka di layar guru", "Jawab secepat dan setepat mungkin"] },
    { title: "Melihat hasil", steps: ["Menu Riwayat Nilai", "Klik nilai untuk melihat pembahasan (jika diizinkan guru)", "Kumpulkan XP & badge di menu Pencapaian"] },
  ],
  school_admin: [
    { title: "Menyiapkan sekolah", steps: ["Tambah mata pelajaran & kelas", "Undang guru lewat menu Undangan", "Tugaskan guru ke kelas di menu Guru & Staf"] },
    { title: "Mendaftarkan siswa", steps: ["Impor CSV di menu Undangan atau buat kode kelas", "Siswa mendaftar sendiri dengan email & password mereka", "Undangan terikat email diterima otomatis saat login"] },
    { title: "Memantau sekolah", steps: ["Dasbor Sekolah untuk statistik", "Menu Aktivitas untuk jejak audit", "Pengaturan untuk tahun ajaran & privasi leaderboard"] },
  ],
};

export function UserGuide({ role }: { role: AppRole | null }) {
  const guide = GUIDES[role === "super_admin" ? "school_admin" : role ?? "student"] ?? GUIDES.student;
  return (
    <Card>
      <CardHeader title="Panduan singkat" description="Langkah-langkah utama sesuai peran Anda" />
      <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {guide.map((g) => (
          <div key={g.title} className="rounded-2xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-800">{g.title}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
