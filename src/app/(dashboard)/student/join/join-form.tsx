"use client";
import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { startAttemptByCode } from "@/features/attempts/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { FormResult, SubmitButton } from "@/components/forms/form-kit";

export function JoinForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action] = useActionState(startAttemptByCode, null);
  return (
    <Card className="p-8 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient text-white shadow-lg shadow-brand-600/30"><KeyRound className="h-8 w-8" /></span>
      <h1 className="mt-5 text-2xl font-extrabold text-slate-900">Masukkan kode kuis</h1>
      <p className="mt-1 text-sm text-slate-500">Minta kode dari gurumu, lalu ketik di bawah.</p>
      <form action={action} className="mt-6 space-y-4">
        <FormResult state={state} />
        <Input name="code" defaultValue={defaultCode} required maxLength={10} autoComplete="off" autoCapitalize="characters"
          className="h-16 text-center font-mono text-3xl font-extrabold uppercase tracking-[0.4em]" placeholder="ABC123" aria-label="Kode kuis" />
        <SubmitButton size="lg" variant="accent" className="w-full">Gabung & mulai</SubmitButton>
      </form>
      <p className="mt-4 text-xs text-slate-400">Timer dimulai setelah kode diterima.</p>
    </Card>
  );
}
