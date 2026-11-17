"use client";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { resendVerification } from "@/features/auth/actions";
import { FormResult, SubmitButton } from "@/components/forms/form-kit";

function VerifyEmailInner() {
  const email = useSearchParams().get("email") ?? "";
  const [state, action] = useActionState(resendVerification, null);
  return (
    <div className="text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-50 text-accent-600">
        <MailCheck className="h-8 w-8" />
      </span>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">Cek email Anda</h1>
      <p className="mt-2 text-sm text-slate-500">
        Kami telah mengirim tautan verifikasi ke <strong className="text-slate-700">{email || "email Anda"}</strong>. Klik tautan
        tersebut untuk mengaktifkan akun.
      </p>
      <form action={action} className="mt-8 space-y-3">
        <FormResult state={state} />
        <input type="hidden" name="email" value={email} />
        <SubmitButton variant="outline" className="w-full" disabled={!email}>Kirim ulang email verifikasi</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        Sudah verifikasi? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Masuk</Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
