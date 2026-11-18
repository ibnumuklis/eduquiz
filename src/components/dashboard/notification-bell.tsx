"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelative } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Notification dropdown with Supabase Realtime (no polling). */
export function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data as Notification[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: Notification }) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 15));
          toast(n.title, { description: n.body ?? undefined });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function markAllRead() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }

  async function markRead(id: string) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).eq("id", id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-fade-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifikasi</p>
            <button onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
            </button>
          </div>
          <ul className="max-h-[min(24rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Belum ada notifikasi</li>}
            {items.map((n) => {
              const content = (
                <div className={cn("flex gap-3 px-4 py-3 transition hover:bg-slate-50", !n.read_at && "bg-brand-50/50")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{formatRelative(n.created_at)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b border-slate-50 last:border-0">
                  {n.link ? (
                    <Link href={n.link} onClick={() => markRead(n.id)}>{content}</Link>
                  ) : (
                    <button className="w-full text-left" onClick={() => markRead(n.id)}>{content}</button>
                  )}
                </li>
              );
            })}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-brand-600 hover:bg-slate-50">
            Lihat semua
          </Link>
        </div>
      )}
    </div>
  );
}
