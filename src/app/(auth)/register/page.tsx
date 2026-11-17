import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Buat akun EDUQUIZ</h1>
      <p className="mt-1 text-sm text-slate-500">
        Guru dapat membuat sekolah baru atau bergabung dengan kode undangan. Siswa bergabung memakai kode dari sekolah.
      </p>
      <div className="mt-8">
        <RegisterForm invite={invite} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Sudah punya akun? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Masuk</Link>
      </p>
    </>
  );
}
