import type { Metadata } from "next";
import { requireSchoolRole } from "@/lib/permissions/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { AccommodationsTable, type AccStudent } from "./accommodations-table";

export const metadata: Metadata = { title: "Akomodasi Siswa" };

export default async function AccommodationsPage() {
  const session = await requireSchoolRole("teacher");
  const supabase = await createClient();
  const isAdmin = session.role === "school_admin";
  const [{ data: classRows }, { data: memberRows }, { data: acc }] = await Promise.all([
    supabase.from("class_students").select("student_id, class:classes(name), student:profiles(full_name)").eq("school_id", session.schoolId).limit(3000),
    isAdmin
      ? supabase.from("school_members").select("user_id, student_number, profile:profiles(full_name)").eq("school_id", session.schoolId).eq("role", "student").limit(3000)
      : Promise.resolve({ data: [] }),
    supabase.from("student_accommodations").select("student_id, time_multiplier, reduce_options, read_aloud, notes").eq("school_id", session.schoolId),
  ]);
  const map = new Map<string, AccStudent>();
  ((memberRows ?? []) as unknown as { user_id: string; profile: { full_name: string } | null }[]).forEach((m) =>
    map.set(m.user_id, { id: m.user_id, name: m.profile?.full_name ?? "Siswa", classes: [] }));
  ((classRows ?? []) as unknown as { student_id: string; class: { name: string } | null; student: { full_name: string } | null }[]).forEach((c) => {
    const cur = map.get(c.student_id) ?? { id: c.student_id, name: c.student?.full_name ?? "Siswa", classes: [] };
    if (c.class?.name && !cur.classes.includes(c.class.name)) cur.classes.push(c.class.name);
    map.set(c.student_id, cur);
  });
  const settings = Object.fromEntries(((acc ?? []) as { student_id: string; time_multiplier: number; reduce_options: boolean; read_aloud: boolean; notes: string | null }[])
    .map((a) => [a.student_id, { ...a, time_multiplier: Number(a.time_multiplier) }]));
  const students = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Akomodasi siswa" description="Penyesuaian untuk siswa berkebutuhan khusus atau yang memerlukan dukungan belajar. Berlaku otomatis di semua kuis." />
      <Alert tone="info" className="mb-4">
        Waktu tambahan dihitung dari durasi kuis (mis. 30 menit × 1,5 = 45 menit). “Kurangi opsi” menyisakan sekitar setengah opsi pilihan ganda (jawaban benar selalu ada).
        “Bacakan soal” membuat soal dibacakan otomatis dengan suara bahasa Indonesia bawaan perangkat.
      </Alert>
      <AccommodationsTable students={students} settings={settings} />
    </>
  );
}
