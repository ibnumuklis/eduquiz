"use client";
import { useActionState } from "react";
import { resetPassword } from "@/features/auth/actions";
import { Field, Input } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(resetPassword, null);
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Buat password baru</h1>
      <p className="mt-1 text-sm text-slate-500">Gunakan minimal 8 karakter yang mengandung huruf dan angka.</p>
      <form action={action} className="mt-8 space-y-4" noValidate>
        <FormResult state={state} />
        <Field label="Password baru" htmlFor="password" error={fieldError(state, "password")}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Ulangi password" htmlFor="confirm_password" error={fieldError(state, "confirm_password")}>
          <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required />
        </Field>
        <SubmitButton className="w-full" size="lg">Simpan password</SubmitButton>
      </form>
    </>
  );
}
