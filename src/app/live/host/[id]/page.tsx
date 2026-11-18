import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/permissions/session";
import { fetchLiveState } from "@/features/live/actions";
import { LiveHost } from "@/components/live/live-host";

export const metadata: Metadata = { title: "Live — Layar Guru" };

export default async function LiveHostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const r = await fetchLiveState(id);
  if (!r.ok || !r.data) notFound();
  if (!r.data.is_host) redirect(`/live/play/${id}`);
  return <LiveHost initial={r.data} />;
}
