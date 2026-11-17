"use client";
import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { createInvitation } from "@/features/schools/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";

export function InvitationForm({ classes, defaultRole, hasMailer }: { classes: { id: string; name: string }[]; defaultRole: "teacher" | "student"; hasMailer: boolean }) {
  const [state, action] = useActionState(createInvitation, null);
  const [role, setRole] = useState<string>(defaultRole);
  const [email, setEmail] = useState("");
  const code = state?.ok ? state.data?.code : undefined;

  return (
    <Card>
      <CardHeader title="Buat undangan" description="Kode berlaku sekali pakai jika diikat ke email" />
      <CardBody>
        <form action={action} className="space-y-4">
          <FormResult state={state} />
          {code && (
            <Alert tone="success" title="Kode undangan">
              <div className="mt-1 flex items-center gap-3">
                <span className="font-mono text-xl font-bold tracking-[0.3em]">{code}</span>
                <button type="button" onClick={() => { navigator.clipboard.writeText(code); toast.success("Kode disalin"); }} className="rounded-lg p-1 hover:bg-emerald-100" aria-label="Salin kode">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </Alert>
          )}
          <Field label="Peran" htmlFor="role">
            <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Siswa</option>
              <option value="teacher">Guru</option>
              <option value="school_admin">Admin Sekolah</option>
            </Select>
          </Field>
          <Field label="Email (disarankan)" htmlFor="email" error={fieldError(state, "email")} hint="Jika diisi, hanya pemilik email terverifikasi yang bisa memakai kode dan undangan diterima otomatis saat login.">
            <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama lengkap" htmlFor="full_name"><Input id="full_name" name="full_name" /></Field>
            {role === "student" && <Field label="NIS" htmlFor="student_number"><Input id="student_number" name="student_number" /></Field>}
          </div>
          {role === "student" && (
            <Field label="Masukkan ke kelas" htmlFor="class_id">
              <Select id="class_id" name="class_id" defaultValue="">
                <option value="">— Tanpa kelas —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maks. pemakaian" htmlFor="max_uses" hint={email ? "Undangan email: 1x" : "Untuk kode kelas bersama"}>
              <Input id="max_uses" name="max_uses" type="number" min={1} max={1000} defaultValue={1} disabled={!!email} />
            </Field>
            <Field label="Berlaku (hari)" htmlFor="valid_days"><Input id="valid_days" name="valid_days" type="number" min={1} max={90} defaultValue={14} /></Field>
          </div>
          {email && hasMailer && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="send_email" className="h-4 w-4 accent-brand-600" defaultChecked /> Kirim email undangan otomatis
            </label>
          )}
          <SubmitButton className="w-full">Buat undangan</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
