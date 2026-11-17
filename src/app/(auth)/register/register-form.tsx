"use client";
import { useActionState } from "react";
import { signUp } from "@/features/auth/actions";
import { Field, Input } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export function RegisterForm({ invite }: { invite?: string }) {
  const [state, action] = useActionState(signUp, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormResult state={state} />
      <Field label="Nama lengkap" htmlFor="full_name" error={fieldError(state, "full_name")}>
        <Input id="full_name" name="full_name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="password" error={fieldError(state, "password")} hint="Min. 8 karakter, huruf & angka">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Ulangi password" htmlFor="confirm_password" error={fieldError(state, "confirm_password")}>
          <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <Field label="Kode undangan (opsional)" htmlFor="invite" hint="Diberikan oleh admin sekolah atau guru Anda">
        <Input id="invite" name="invite" defaultValue={invite} maxLength={8} className="uppercase tracking-widest" placeholder="ABCD2345" />
      </Field>
      <SubmitButton className="w-full" size="lg">Daftar</SubmitButton>
    </form>
  );
}
