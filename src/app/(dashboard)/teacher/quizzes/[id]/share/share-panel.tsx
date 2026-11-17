"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, GraduationCap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { regenerateAccessCode, setAssignments } from "@/features/quizzes/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizAccess, QuizStatus } from "@/types";

export function SharePanel({
  quizId, accessCode, access, status, classes, assigned, joinUrl, isAdmin,
}: {
  quizId: string; accessCode: string; access: QuizAccess; status: QuizStatus;
  classes: { id: string; name: string; students: number }[]; assigned: string[]; joinUrl: string; isAdmin: boolean;
}) {
  const [selected, setSelected] = useState(new Set(assigned));
  const [pending, start] = useTransition();
  const dirty = selected.size !== assigned.length || assigned.some((a) => !selected.has(a));
  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast.success(`${l} disalin`); };
  const codeEnabled = access !== "assigned";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader
          title="Tugaskan ke kelas"
          description="Siswa di kelas terpilih melihat kuis ini di dasbor mereka"
          action={<Button loading={pending} disabled={!dirty} onClick={() => start(async () => { const r = await setAssignments(quizId, [...selected]); if (r.ok) toast.success(r.message ?? "OK"); else toast.error(r.error); })}>Simpan penugasan</Button>}
        />
        <CardBody>
          {classes.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Belum ada kelas yang Anda ajar" description={isAdmin ? "Buat kelas di menu Kelas." : "Minta admin sekolah menugaskan Anda ke kelas (menu Guru & Staf)."} action={isAdmin ? <Link href="/school/classes" className="text-sm font-semibold text-brand-600">Kelola kelas</Link> : undefined} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {classes.map((c) => {
                const on = selected.has(c.id);
                return (
                  <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition", on ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={on}
                      onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                    <span className="flex-1">
                      <span className="block font-medium text-slate-800">{c.name}</span>
                      <span className="block text-xs text-slate-500">{c.students} siswa</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {status === "published" && dirty && <Alert tone="info" className="mt-4">Siswa di kelas baru akan langsung melihat kuis ini.</Alert>}
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Kode akses kuis" description={codeEnabled ? "Siswa sekolah Anda dapat bergabung dengan kode ini" : "Aktifkan akses kode di tab Pengaturan"} />
        <CardBody className="space-y-4">
          <div className={cn("rounded-2xl bg-brand-gradient p-6 text-center text-white", !codeEnabled && "opacity-50 grayscale")}>
            <p className="text-xs uppercase tracking-widest text-white/70">Kode kuis</p>
            <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.3em]">{accessCode}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => copy(accessCode, "Kode")}><Copy className="h-4 w-4" /> Salin kode</Button>
            <Button variant="outline" onClick={() => copy(joinUrl, "Tautan")}><Copy className="h-4 w-4" /> Salin tautan</Button>
          </div>
          <Button variant="ghost" className="w-full" loading={pending}
            onClick={() => start(async () => { const r = await regenerateAccessCode(quizId); if (r.ok) toast.success(r.message ?? "OK"); else toast.error(r.error); })}>
            <RefreshCw className="h-4 w-4" /> Buat kode baru
          </Button>
          {status === "draft" && <Alert tone="warning">Kuis masih draft — siswa belum dapat mengerjakan sampai dipublikasikan.</Alert>}
        </CardBody>
      </Card>
    </div>
  );
}
