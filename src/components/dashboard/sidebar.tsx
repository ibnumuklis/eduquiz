"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award, BarChart3, BookOpen, Building2, ClipboardCheck, ClipboardList, GraduationCap, History, KeyRound,
  LayoutDashboard, Library, Mail, ScrollText, Settings, Shield, Trophy, Users, UserSquare2, X,
} from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types";

interface NavItem { href: string; label: string; icon: ComponentType<LucideProps>; exact?: boolean }
interface NavSection { title?: string; items: NavItem[] }

const teacherTools: NavItem[] = [
  { href: "/teacher/quizzes", label: "Kuis Saya", icon: ClipboardList },
  { href: "/teacher/bank", label: "Bank Soal", icon: Library },
  { href: "/teacher/grading", label: "Koreksi Jawaban", icon: ClipboardCheck },
  { href: "/teacher/classes", label: "Kelas Saya", icon: GraduationCap },
];

function sectionsFor(role: AppRole | null, isSuperAdmin: boolean): NavSection[] {
  const sections: NavSection[] = [];
  if (role === "school_admin") {
    sections.push({
      items: [
        { href: "/school", label: "Dasbor Sekolah", icon: LayoutDashboard, exact: true },
        { href: "/school/teachers", label: "Guru & Staf", icon: UserSquare2 },
        { href: "/school/students", label: "Siswa", icon: Users },
        { href: "/school/classes", label: "Kelas", icon: GraduationCap },
        { href: "/school/subjects", label: "Mata Pelajaran", icon: BookOpen },
        { href: "/school/invitations", label: "Undangan", icon: Mail },
        { href: "/school/activity", label: "Aktivitas", icon: ScrollText },
        { href: "/school/settings", label: "Pengaturan Sekolah", icon: Settings },
      ],
    });
    sections.push({ title: "Mengajar", items: [{ href: "/teacher", label: "Dasbor Guru", icon: BarChart3, exact: true }, ...teacherTools] });
  } else if (role === "teacher") {
    sections.push({ items: [{ href: "/teacher", label: "Dasbor", icon: LayoutDashboard, exact: true }, ...teacherTools] });
  } else if (role === "student") {
    sections.push({
      items: [
        { href: "/student", label: "Dasbor", icon: LayoutDashboard, exact: true },
        { href: "/student/quizzes", label: "Kuis", icon: ClipboardList },
        { href: "/student/join", label: "Gabung dengan Kode", icon: KeyRound },
        { href: "/student/history", label: "Riwayat Nilai", icon: History },
        { href: "/student/achievements", label: "Pencapaian", icon: Award },
        { href: "/student/leaderboard", label: "Leaderboard", icon: Trophy },
      ],
    });
  }
  if (isSuperAdmin) {
    sections.push({
      title: "Platform",
      items: [
        { href: "/admin", label: "Statistik Platform", icon: Shield, exact: true },
        { href: "/admin/schools", label: "Manajemen Sekolah", icon: Building2 },
        { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
      ],
    });
  }
  return sections;
}

export function Sidebar({
  role,
  isSuperAdmin,
  open,
  onClose,
}: {
  role: AppRole | null;
  isSuperAdmin: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const sections = sectionsFor(role, isSuperAdmin);
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <>
      <div
        className={cn("fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200/70 bg-white transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navigasi utama"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo href="/dashboard" />
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Tutup menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section, i) => (
            <div key={section.title ?? i}>
              {section.title && <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{section.title}</p>}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                          active ? "bg-brand-gradient text-white shadow-md shadow-brand-600/25" : "text-slate-600 hover:bg-brand-50 hover:text-brand-700",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon className={cn("h-[18px] w-[18px]", active ? "text-white" : "text-slate-400 group-hover:text-brand-600")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="m-3 rounded-2xl bg-gradient-to-br from-brand-50 to-accent-50 p-4">
          <p className="text-sm font-semibold text-brand-800">Learn. Play. Achieve.</p>
          <p className="mt-1 text-xs text-slate-600">Butuh bantuan? Lihat panduan pengguna di menu Profil.</p>
        </div>
      </aside>
    </>
  );
}
