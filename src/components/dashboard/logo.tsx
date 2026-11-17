import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, light = false, href = "/" }: { className?: string; light?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="EDUQUIZ beranda">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl text-white", light ? "bg-white/20 ring-1 ring-white/30" : "bg-brand-gradient shadow-md shadow-brand-600/30")}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3 3 8l9 5 9-5-9-5Z" />
          <path d="M7 10.5v4.5c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5" />
          <path d="M21 8v6" />
        </svg>
      </span>
      <span className={cn("text-lg font-extrabold tracking-tight", light ? "text-white" : "text-slate-900")}>
        EDU<span className={light ? "text-accent-400" : "text-brand-600"}>QUIZ</span>
      </span>
    </Link>
  );
}
