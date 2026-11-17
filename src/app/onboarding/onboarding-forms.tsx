"use client";
import { useActionState } from "react";
import { Building2, KeyRound } from "lucide-react";
import { createSchool, joinWithInvitation } from "@/features/schools/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export function OnboardingForms({ invite }: { invite?: string }) {
  const [joinState, joinAction] = useActionState(joinWithInvitation, null);
  const [schoolState, schoolAction] = useActionState(createSchool, null);

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-50 text-accent-600"><KeyRound className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Gabung dengan kode undangan</h2>
        <p className="mt-1 text-sm text-slate-500">Untuk siswa dan guru yang diundang oleh admin sekolah.</p>
        <form action={joinAction} className="mt-6 space-y-4">
          <FormResult state={joinState} />
          <Field label="Kode undangan" htmlFor="code" error={fieldError(joinState, "code")}>
            <Input id="code" name="code" defaultValue={invite} maxLength={8} required className="h-12 text-center text-lg font-bold uppercase tracking-[0.4em]" placeholder="ABCD2345" />
          </Field>
          <SubmitButton variant="accent" className="w-full">Gabung</SubmitButton>
        </form>
      </Card>

      <Card className="p-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Building2 className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Daftarkan sekolah baru</h2>
        <p className="mt-1 text-sm text-slate-500">Anda akan menjadi Admin Sekolah dan dapat mengundang guru & siswa.</p>
        <form action={schoolAction} className="mt-6 space-y-4">
          <FormResult state={schoolState} />
          <Field label="Nama sekolah" htmlFor="name" error={fieldError(schoolState, "name")}>
            <Input id="name" name="name" required placeholder="SMA Negeri 1 Makassar" />
          </Field>
          <Field label="Alamat" htmlFor="address" error={fieldError(schoolState, "address")}>
            <Textarea id="address" name="address" className="min-h-16" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email sekolah" htmlFor="email" error={fieldError(schoolState, "email")}>
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label="Zona waktu" htmlFor="timezone">
              <Select id="timezone" name="timezone" defaultValue="Asia/Makassar">
                <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
              </Select>
            </Field>
          </div>
          <SubmitButton className="w-full">Buat sekolah</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
