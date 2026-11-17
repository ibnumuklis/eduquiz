"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/features/auth/actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export function LoginForm({ next, linkError }: { next?: string; linkError?: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      {linkError && <Alert tone="error">Tautan tidak valid atau sudah kedaluwarsa. Silakan coba lagi.</Alert>}
      <FormResult state={state} />
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field label="Email" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@sekolah.sch.id" />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldError(state, "password")}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Lupa password?</Link>
      </div>
      <SubmitButton className="w-full" size="lg">Masuk</SubmitButton>
    </form>
  );
}
