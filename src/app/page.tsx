import Link from "next/link";
import { Award, BarChart3, CheckCircle2, ClipboardList, Radio, ShieldCheck, Sparkles, Timer, Trophy, Users } from "lucide-react";
import { Logo } from "@/components/dashboard/logo";
import { buttonClass } from "@/components/ui/button";

const features = [
  { icon: ClipboardList, title: "Question builder lengkap", text: "Pilihan ganda, pilihan ganda kompleks, benar/salah, jawaban singkat, dan isian — lengkap dengan gambar & pembahasan." },
  { icon: Timer, title: "Pengerjaan anti-gagal", text: "Timer server, autosave tiap jawaban, pemulihan sesi saat refresh, dan auto-submit ketika waktu habis." },
  { icon: Radio, title: "Monitoring realtime", text: "Pantau siapa yang sedang mengerjakan, progres, dan nilai tanpa perlu refresh." },
  { icon: BarChart3, title: "Laporan siap ekspor", text: "Rata-rata, ranking, distribusi nilai, dan ekspor ke CSV atau Excel." },
  { icon: Trophy, title: "Gamifikasi", text: "XP, level, badge, streak belajar, dan leaderboard kelas yang menghormati privasi." },
  { icon: ShieldCheck, title: "Aman & multi-sekolah", text: "Data tiap sekolah terisolasi dengan Row Level Security; kunci jawaban tidak pernah dikirim ke siswa." },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass("ghost")}>Masuk</Link>
          <Link href="/register" className={buttonClass("primary")}>Daftar gratis</Link>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-5xl rounded-full bg-gradient-to-br from-brand-200/60 via-violet-200/50 to-accent-100/60 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-semibold text-brand-700">
              <Sparkles className="h-3.5 w-3.5" /> Interactive Learning & Assessment Platform
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Kuis interaktif untuk <span className="text-brand-gradient">sekolah modern</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              EDUQUIZ membantu guru membuat, membagikan, dan menilai kuis secara digital — sementara siswa belajar dengan
              pengalaman yang seru dan memotivasi. <strong className="text-slate-800">Learn. Play. Achieve.</strong>
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass("primary", "lg")}>Mulai sekarang</Link>
              <Link href="/login" className={buttonClass("outline", "lg")}>Saya sudah punya akun</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {["Multi-sekolah", "Penilaian otomatis", "Bisa di HP & tablet"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent-500" /> {t}</li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-brand-900/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Soal 3 dari 10</span>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">⏱ 12:45</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 w-1/3 rounded-full bg-brand-gradient" /></div>
              <p className="mt-5 font-semibold text-slate-800">Hasil dari 3x + 5 = 20, maka nilai x adalah…</p>
              <div className="mt-4 space-y-2.5">
                {["3", "5", "7", "15"].map((o, i) => (
                  <div key={o} className={i === 1 ? "flex items-center gap-3 rounded-xl border-2 border-brand-500 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" : "flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"}>
                    <span className={i === 1 ? "grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white" : "grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500"}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {o}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:block">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-500"><Award className="h-5 w-5" /></span>
                <div>
                  <p className="text-xs text-slate-500">Pencapaian baru</p>
                  <p className="text-sm font-bold text-slate-800">Nilai Sempurna +50 XP</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-slate-900">Semua yang dibutuhkan guru & siswa</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Dirancang untuk banyak sekolah, banyak kelas, dan banyak guru dalam satu platform.</p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 rounded-3xl bg-brand-gradient p-10 text-white md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Siap membawa kelas Anda ke level berikutnya?</h2>
            <p className="mt-2 text-white/80">Daftarkan sekolah dalam 1 menit, undang guru & siswa dengan kode aman.</p>
          </div>
          <Link href="/register" className={buttonClass("outline", "lg", "border-0 text-brand-700")}><Users className="h-5 w-5" /> Daftarkan sekolah</Link>
        </div>
      </section>
      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} EDUQUIZ — Learn. Play. Achieve.</footer>
    </div>
  );
}
