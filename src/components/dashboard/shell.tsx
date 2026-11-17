"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Menu, School, UserCog } from "lucide-react";
import { Sidebar } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { Avatar } from "@/components/ui/feedback";
import { signOut, switchSchool } from "@/features/auth/actions";
import type { AppRole } from "@/types";

const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  school_admin: "Admin Sekolah",
  teacher: "Guru",
  student: "Siswa",
};

export interface ShellProps {
  userId: string;
  name: string;
  email: string;
  role: AppRole | null;
  isSuperAdmin: boolean;
  schoolId: string | null;
  schools: { id: string; name: string; role: AppRole }[];
  children: React.ReactNode;
}

export function DashboardShell({ userId, name, email, role, isSuperAdmin, schoolId, schools, children }: ShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, start] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const activeSchool = schools.find((s) => s.id === schoolId);

  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="min-h-dvh">
      <Sidebar role={role} isSuperAdmin={isSuperAdmin} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <button onClick={() => setNavOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {schools.length > 1 ? (
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
                <School className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="sr-only">Pilih sekolah</span>
                <select
                  className="min-w-0 truncate bg-transparent text-sm font-medium text-slate-700 focus:outline-none"
                  value={schoolId ?? ""}
                  disabled={pending}
                  onChange={(e) => start(() => switchSchool(e.target.value))}
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {roleLabel[s.role]}</option>
                  ))}
                </select>
              </label>
            ) : activeSchool ? (
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
                <School className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="truncate">{activeSchool.name}</span>
              </span>
            ) : null}
          </div>
          <NotificationBell userId={userId} />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100" aria-expanded={menuOpen} aria-label="Menu akun">
              <Avatar name={name} />
              <span className="hidden text-left sm:block">
                <span className="block max-w-36 truncate text-sm font-semibold text-slate-800">{name}</span>
                <span className="block text-xs text-slate-500">{role ? roleLabel[role] : "Belum ada sekolah"}</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl animate-fade-in">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
                  <p className="truncate text-xs text-slate-500">{email}</p>
                </div>
                <Link href="/settings/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                  <UserCog className="h-4 w-4" /> Profil & Keamanan
                </Link>
                <Link href="/onboarding" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                  <School className="h-4 w-4" /> Gabung / buat sekolah
                </Link>
                <form action={signOut}>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut className="h-4 w-4" /> Keluar
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
