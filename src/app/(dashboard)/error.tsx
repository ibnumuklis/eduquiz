"use client";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><TriangleAlert className="h-7 w-7" /></span>
      <h1 className="mt-4 text-xl font-bold text-slate-900">Terjadi kesalahan</h1>
      <p className="mt-1 text-sm text-slate-500">Halaman ini gagal dimuat. Periksa koneksi Anda lalu coba lagi.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">Kode: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}><RefreshCw className="h-4 w-4" /> Coba lagi</Button>
    </div>
  );
}
