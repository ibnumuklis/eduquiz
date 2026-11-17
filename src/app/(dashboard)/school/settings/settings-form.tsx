"use client";
import { useActionState, useState } from "react";
import { updateSchoolSettings } from "@/features/schools/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { FormResult, SubmitButton, fieldError } from "@/components/forms/form-kit";
import type { School } from "@/types";

export function SettingsForm({ school }: { school: School }) {
  const [state, action] = useActionState(updateSchoolSettings, null);
  const [lb, setLb] = useState(school.leaderboard_enabled);
  const [names, setNames] = useState(school.leaderboard_show_names);
  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profil sekolah" />
        <CardBody className="space-y-4">
          <FormResult state={state} />
          <Field label="Nama sekolah" htmlFor="name" error={fieldError(state, "name")}><Input id="name" name="name" defaultValue={school.name} required /></Field>
          <Field label="Alamat" htmlFor="address"><Textarea id="address" name="address" defaultValue={school.address ?? ""} className="min-h-16" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={fieldError(state, "email")}><Input id="email" name="email" type="email" defaultValue={school.email ?? ""} /></Field>
            <Field label="Telepon" htmlFor="phone"><Input id="phone" name="phone" defaultValue={school.phone ?? ""} /></Field>
          </div>
          <Field label="Zona waktu" htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={school.timezone}>
              <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
              <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
              <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
            </Select>
          </Field>
        </CardBody>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Tahun ajaran" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Tahun ajaran" htmlFor="academic_year" error={fieldError(state, "academic_year")}><Input id="academic_year" name="academic_year" defaultValue={school.academic_year ?? ""} placeholder="2026/2027" /></Field>
            <Field label="Semester" htmlFor="semester">
              <Select id="semester" name="semester" defaultValue={school.semester ?? ""}>
                <option value="">—</option><option value="ganjil">Ganjil</option><option value="genap">Genap</option>
              </Select>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Privasi leaderboard" />
          <CardBody className="space-y-3">
            <Toggle name="leaderboard_enabled" checked={lb} onChange={setLb} label="Aktifkan leaderboard" description="Siswa dapat melihat peringkat XP di sekolah/kelas" />
            <Toggle name="leaderboard_show_names" checked={names} onChange={setNames} disabled={!lb} label="Tampilkan nama siswa" description="Jika dimatikan, siswa lain ditampilkan anonim" />
          </CardBody>
        </Card>
        <div className="flex justify-end"><SubmitButton size="lg">Simpan pengaturan</SubmitButton></div>
      </div>
    </form>
  );
}
