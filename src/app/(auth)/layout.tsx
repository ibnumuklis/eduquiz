import { Award, BarChart3, Sparkles } from "lucide-react";
import { Logo } from "@/components/dashboard/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent-400/20 blur-3xl" />
        <Logo light />
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight">Learn. Play. Achieve.</h1>
          <p className="mt-4 text-lg text-white/80">
            Platform kuis interaktif untuk sekolah — guru membuat dan menilai kuis dengan mudah, siswa belajar sambil
            mengumpulkan XP dan pencapaian.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              { icon: Sparkles, text: "Question builder dengan 5 tipe soal & penilaian otomatis" },
              { icon: BarChart3, text: "Monitoring realtime & laporan nilai siap ekspor" },
              { icon: Award, text: "XP, level, badge, dan leaderboard kelas" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Icon className="h-4.5 w-4.5" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} EDUQUIZ</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
