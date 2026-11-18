import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/permissions/session";
import { fetchLiveState } from "@/features/live/actions";
import { LivePlayer } from "@/components/live/live-player";

export const metadata: Metadata = { title: "Live" };

export default async function LivePlayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const r = await fetchLiveState(id);
  if (!r.ok || !r.data) notFound();
  if (r.data.is_host) redirect(`/live/host/${id}`);
  return <LivePlayer initial={r.data} />;
}
