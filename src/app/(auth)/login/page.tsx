import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Selamat datang kembali 👋</h1>
      <p className="mt-1 text-sm text-slate-500">Masuk untuk melanjutkan ke EDUQUIZ.</p>
      <div className="mt-8">
        <LoginForm next={next} linkError={error} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">Daftar sekarang</Link>
      </p>
    </>
  );
}
