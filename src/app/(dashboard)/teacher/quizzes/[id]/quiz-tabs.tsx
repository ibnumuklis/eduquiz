"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { QuizStatus } from "@/types";

export function QuizTabs({ id, status }: { id: string; status: QuizStatus }) {
  const pathname = usePathname();
  const base = `/teacher/quizzes/${id}`;
  const tabs = [
    { href: base, label: "Soal" },
    { href: `${base}/settings`, label: "Pengaturan" },
    { href: `${base}/share`, label: "Penugasan & Bagikan" },
    { href: `${base}/preview`, label: "Preview" },
    ...(status !== "draft" ? [{ href: `${base}/monitor`, label: "Monitoring" }, { href: `${base}/results`, label: "Laporan Nilai" }, { href: `${base}/analysis`, label: "Analisis" }] : []),
  ];
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Bagian kuis">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-slate-200 bg-white p-1 sm:min-w-0">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition", active ? "bg-brand-600 text-white shadow" : "text-slate-600 hover:bg-slate-100")}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
