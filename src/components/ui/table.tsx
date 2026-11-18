"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Responsive table. On phones (< 768px) every row becomes a compact card: the first cell is the
 * title and the other cells show "LABEL  value" using the column headers (labels are added
 * automatically). Pass `stack={false}` for wide data grids that should scroll sideways instead.
 */
export function Table({ children, className, stack = true }: { children: ReactNode; className?: string; stack?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!stack || !root) return;
    const label = () => {
      const heads = Array.from(root.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
      root.querySelectorAll("tbody tr").forEach((tr) => {
        let col = 0;
        Array.from(tr.children).forEach((cell) => {
          const td = cell as HTMLTableCellElement;
          const text = heads[col] ?? "";
          if (td.dataset.label !== text) td.dataset.label = text;
          col += td.colSpan || 1;
        });
      });
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [stack]);
  return (
    <div ref={ref} className={cn(stack ? "eq-stack md:overflow-x-auto" : "overflow-x-auto", className)}>
      <table className={cn("w-full text-left text-sm", stack ? "md:min-w-[640px]" : "min-w-[640px]")}>{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">{children}</thead>;
}
export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 font-semibold", className)}>{children}</th>;
}
export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", className)}>{children}</tr>;
}
export function TD({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-4 py-3 align-middle text-slate-700", className)}>{children}</td>;
}
