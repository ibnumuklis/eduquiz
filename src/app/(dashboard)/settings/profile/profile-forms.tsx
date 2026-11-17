"use client";
import { useActionState } from "react";
import { changePassword, updateProfile } from "@/features/auth/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/feedback";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";
import { UserGuide } from "./user-guide";
import type { AppRole } from "@/types";

const roleLabel: Record<string, string> = { school_admin: "Admin Sekolah", teacher: "Guru", student: "Siswa", super_admin: "Super Admin" };

export function ProfileForms({ fullName, phone, email, memberships, role }: { fullName: string; phone: string; email: string; memberships: { school: string; role: string }[]; role: AppRole | null }) {
  const [pState, pAction] = useActionState(updateProfile, null);
  const [sState, sAction] = useActionState(changePassword, null);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Informasi profil" />
        <CardBody>
          <form action={pAction} className="space-y-4">
            <FormResult state={pState} />
            <Field label="Email"><Input value={email} disabled /></Field>
            <Field label="Nama lengkap" htmlFor="full_name" error={fieldError(pState, "full_name")}><Input id="full_name" name="full_name" defaultValue={fullName} required /></Field>
            <Field label="Telepon" htmlFor="phone" error={fieldError(pState, "phone")}><Input id="phone" name="phone" defaultValue={phone} /></Field>
            <SubmitButton>Simpan profil</SubmitButton>
          </form>
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Keanggotaan sekolah</p>
            <ul className="space-y-1.5">
              {memberships.length === 0 && <li className="text-sm text-slate-500">Belum tergabung di sekolah</li>}
              {memberships.map((m) => <li key={m.school} className="flex items-center justify-between text-sm"><span>{m.school}</span><Badge tone="brand">{roleLabel[m.role]}</Badge></li>)}
            </ul>
          </div>
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Ubah password" />
        <CardBody>
          <form action={sAction} className="space-y-4">
            <FormResult state={sState} />
            <Field label="Password saat ini" htmlFor="current_password"><Input id="current_password" name="current_password" type="password" autoComplete="current-password" required /></Field>
            <Field label="Password baru" htmlFor="password" error={fieldError(sState, "password")} hint="Min. 8 karakter, huruf & angka"><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
            <Field label="Ulangi password baru" htmlFor="confirm_password" error={fieldError(sState, "confirm_password")}><Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton>Ubah password</SubmitButton>
          </form>
        </CardBody>
      </Card>
      <div className="lg:col-span-2"><UserGuide role={role} /></div>
    </div>
  );
}
