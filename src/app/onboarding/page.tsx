import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/dashboard/logo";
import { requireSession } from "@/lib/permissions/session";
import { signOut } from "@/features/auth/actions";
import { OnboardingForms } from "./onboarding-forms";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Mulai" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const session = await requireSession();
  const { invite } = await searchParams;
  const inactive = session.memberships.filter((m) => m.school.status !== "active");

  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-50 via-white to-accent-50/40">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo href="/dashboard" />
        <form action={signOut}>
          <button className="text-sm font-medium text-slate-500 hover:text-slate-700">Keluar</button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Halo, {session.profile.full_name.split(" ")[0] || "Selamat datang"}! 👋
        </h1>
        <p className="mt-2 text-slate-600">Hubungkan akun Anda dengan sekolah untuk mulai menggunakan EDUQUIZ.</p>
        {!session.emailVerified && (
          <Alert tone="warning" className="mt-6">Email Anda belum terverifikasi. Beberapa undangan memerlukan email terverifikasi.</Alert>
        )}
        {inactive.length > 0 && (
          <Alert tone="warning" className="mt-6" title="Sekolah dinonaktifkan">
            {inactive.map((m) => m.school.name).join(", ")} sedang dinonaktifkan oleh pengelola platform.
          </Alert>
        )}
        {session.role && (
          <Link href="/dashboard" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
            Lanjut ke dasbor <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <OnboardingForms invite={invite} />
      </main>
    </div>
  );
}
