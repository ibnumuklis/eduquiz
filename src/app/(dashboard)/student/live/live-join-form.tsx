"use client";
import { useActionState } from "react";
import { Radio } from "lucide-react";
import { joinLive } from "@/features/live/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { FormResult, SubmitButton } from "@/components/forms/form-kit";

export function LiveJoinForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action] = useActionState(joinLive, null);
  return (
    <Card className="p-8 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/30"><Radio className="h-8 w-8" /></span>
      <h1 className="mt-5 text-2xl font-extrabold text-slate-900">Gabung kuis Live</h1>
      <p className="mt-1 text-sm text-slate-500">Lihat kode 6 angka di layar gurumu.</p>
      <form action={action} className="mt-6 space-y-4">
        <FormResult state={state} />
        <Input name="code" defaultValue={defaultCode} required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off"
          className="h-16 text-center font-mono text-4xl font-extrabold tracking-[0.4em]" placeholder="000000" aria-label="Kode Live" />
        <SubmitButton size="lg" variant="accent" className="w-full">Gabung</SubmitButton>
      </form>
    </Card>
  );
}
