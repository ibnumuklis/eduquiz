"use client";
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small floating "back to top" button, shown after scrolling down a bit. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(window.scrollY > 320);
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const r = 19, c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Kembali ke atas"
      title="Kembali ke atas"
      className={cn(
        "fixed bottom-24 right-4 z-30 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-brand-700 shadow-lg shadow-brand-600/20 ring-1 ring-brand-100 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-600 hover:text-white lg:bottom-6 lg:right-6 print:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
