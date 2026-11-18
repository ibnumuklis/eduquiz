"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "right" | "left";

/**
 * Accessible hover/focus tooltip rendered in a portal (never clipped by scroll containers).
 * Wrap any element: <Tip content="Keterangan">…</Tip>. Uses `display: contents`, so layout is unchanged.
 */
export function Tip({ content, side = "top", children, delay = 350, className }: {
  content: ReactNode; side?: Side; children: ReactNode; delay?: number; className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number; side: Side } | null>(null);

  const show = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current?.firstElementChild as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      let s = side;
      if (s === "right" && r.right + 260 > window.innerWidth) s = "bottom";
      if (s === "top" && r.top < 60) s = "bottom";
      const x = s === "right" ? r.right + 10 : s === "left" ? r.left - 10 : r.left + r.width / 2;
      const y = s === "top" ? r.top - 8 : s === "bottom" ? r.bottom + 8 : r.top + r.height / 2;
      setPos({ x, y, side: s });
    }, delay);
  }, [side, delay]);
  const hide = useCallback(() => { clearTimeout(timer.current); setPos(null); }, []);

  useEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [pos]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!content) return <>{children}</>;
  const transform = {
    top: "translate(-50%, -100%)", bottom: "translate(-50%, 0)", right: "translate(0, -50%)", left: "translate(-100%, -50%)",
  }[pos?.side ?? side];

  return (
    <span ref={ref} className="contents" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
      onPointerDown={hide} aria-describedby={pos ? id : undefined}>
      {children}
      {pos && typeof document !== "undefined" && createPortal(
        <span id={id} role="tooltip" style={{ left: pos.x, top: pos.y, transform }}
          className={cn("pointer-events-none fixed z-[100] max-w-64 animate-fade-in rounded-xl bg-slate-900/95 px-3 py-2 text-xs font-medium leading-snug text-white shadow-xl shadow-slate-900/20 backdrop-blur", className)}>
          {content}
        </span>,
        document.body,
      )}
    </span>
  );
}
