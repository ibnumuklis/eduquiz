"use client";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "right" | "left";

/**
 * Accessible hover/focus tooltip rendered in a portal (never clipped by scroll containers).
 * Wrap any element: <Tip content="Keterangan">…</Tip>. Uses `display: contents`, so layout is unchanged.
 * Only shown for a real mouse hover or keyboard focus — never on touch screens, where it would
 * otherwise stay stuck on the next page after a tap.
 */
export function Tip({ content, side = "top", children, delay = 450, className }: {
  content: ReactNode; side?: Side; children: ReactNode; delay?: number; className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number; side: Side; path: string } | null>(null);

  const show = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current?.firstElementChild as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      let s = side;
      if (s === "right" && r.right + 220 > window.innerWidth) s = "bottom";
      if (s === "top" && r.top < 40) s = "bottom";
      const x = s === "right" ? r.right + 6 : s === "left" ? r.left - 6 : r.left + r.width / 2;
      const y = s === "top" ? r.top - 5 : s === "bottom" ? r.bottom + 5 : r.top + r.height / 2;
      setPos({ x, y, side: s, path: window.location.pathname });
    }, delay);
  }, [side, delay]);
  const hide = useCallback(() => { clearTimeout(timer.current); setPos(null); }, []);
  const onPointerEnter = useCallback((e: PointerEvent) => { if (e.pointerType === "mouse") show(); }, [show]);
  const onFocus = useCallback((e: FocusEvent) => {
    const el = e.target as HTMLElement;
    let keyboard = false;
    try { keyboard = el.matches(":focus-visible"); } catch { /* old browser */ }
    if (keyboard && !window.matchMedia("(hover: none)").matches) show();
  }, [show]);
  // A tooltip opened on one page never carries over to the next.
  const pathname = usePathname();


  useEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [pos]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!content) return <>{children}</>;
  const visible = pos && pos.path === pathname;
  const transform = {
    top: "translate(-50%, -100%)", bottom: "translate(-50%, 0)", right: "translate(0, -50%)", left: "translate(-100%, -50%)",
  }[pos?.side ?? side];

  return (
    <span ref={ref} className="contents" onPointerEnter={onPointerEnter} onPointerLeave={hide} onFocus={onFocus} onBlur={hide}
      onPointerDown={hide} aria-describedby={visible ? id : undefined}>
      {children}
      {visible && typeof document !== "undefined" && createPortal(
        <span id={id} role="tooltip" style={{ left: pos.x, top: pos.y, transform }}
          className={cn("pointer-events-none fixed z-[100] max-w-52 animate-fade-in rounded-md bg-slate-800/70 px-2 py-1 text-[11px] font-normal italic leading-snug text-white/95 shadow-sm backdrop-blur-sm", className)}>
          {content}
        </span>,
        document.body,
      )}
    </span>
  );
}
