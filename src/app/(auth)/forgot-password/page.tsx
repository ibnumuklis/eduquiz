"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/features/auth/actions";
import { Field, Input } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Lupa password</h1>
      <p className="mt-1 text-sm text-slate-500">Masukkan email Anda. Kami akan mengirim tautan untuk membuat password baru.</p>
      <form action={action} className="mt-8 space-y-4" noValidate>
        <FormResult state={state} />
        <Field label="Email" htmlFor="email" error={fieldError(state, "email")}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full" size="lg">Kirim tautan reset</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">Kembali ke halaman masuk</Link>
      </p>
    </>
  );
}
