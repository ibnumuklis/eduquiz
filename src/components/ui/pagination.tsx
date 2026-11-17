import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 20;

export function pageRange(page: number, size = PAGE_SIZE) {
  const p = Math.max(1, page);
  return { from: (p - 1) * size, to: p * size - 1, page: p };
}

export function Pagination({
  page,
  total,
  basePath,
  params = {},
  size = PAGE_SIZE,
}: {
  page: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const cls = (disabled: boolean) =>
    cn("inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50", disabled && "pointer-events-none opacity-40");
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500" aria-label="Halaman">
      <span>Halaman {page} dari {pages} · {total} data</span>
      <div className="flex gap-2">
        <Link href={href(page - 1)} className={cls(page <= 1)} aria-disabled={page <= 1}><ChevronLeft className="h-4 w-4" /> Sebelumnya</Link>
        <Link href={href(page + 1)} className={cls(page >= pages)} aria-disabled={page >= pages}>Berikutnya <ChevronRight className="h-4 w-4" /></Link>
      </div>
    </nav>
  );
}
