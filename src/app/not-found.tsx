import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-extrabold text-brand-gradient">404</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Halaman tidak ditemukan</h1>
        <p className="mt-1 text-sm text-slate-500">Halaman tidak ada atau Anda tidak memiliki akses.</p>
        <Link href="/dashboard" className={buttonClass("primary", "md", "mt-6")}>Kembali ke dasbor</Link>
      </div>
    </div>
  );
}
